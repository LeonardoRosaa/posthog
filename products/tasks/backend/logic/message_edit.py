"""Editing a message the user sent: where a successor run cuts its history, and what it sends again.

A run log is append-only, so an edit never rewrites one. The run that an edit creates stores the address of
the edited message as its cut. A history read keeps the log of the run at that address only before the
address, and drops the runs between that run and the cut.
"""

import re
import json
from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

from posthog.dataclasses import frozen

from products.posthog_ai.backend.turn_suggestions.transcript import human_text, is_turn_text
from products.tasks.backend.constants import EDIT_CUT_STATE_KEY

if TYPE_CHECKING:
    from products.tasks.backend.models import TaskRun


@frozen
class LogCut:
    """The address of an edited message: its run, and its index in that run's own log."""

    run_id: str
    index: int

    def to_state(self) -> dict[str, Any]:
        return {"run_id": self.run_id, "index": self.index}


@frozen
class HistorySegment:
    """One run of a history read. ``end`` is the number of its log entries the read keeps, or ``None`` for all."""

    run: "TaskRun"
    end: int | None = None


@frozen
class AttachedArtifact:
    """A file a user message carried: the run whose manifest lists it, and its id there."""

    run_id: str
    artifact_id: str


@frozen
class EditedMessage:
    """The user message at an address: its visible text, the context blocks sent before that text, the
    permission mode the run was in when the user sent it, and the files it carried."""

    text: str
    context: str
    mode: str | None
    artifacts: tuple[AttachedArtifact, ...] = ()


def log_cut_from_state(state: Mapping[str, Any] | None) -> LogCut | None:
    cut = (state or {}).get(EDIT_CUT_STATE_KEY)
    if not isinstance(cut, Mapping):
        return None
    run_id, index = cut.get("run_id"), cut.get("index")
    if not isinstance(run_id, str) or not run_id or isinstance(index, bool) or not isinstance(index, int):
        return None
    if index < 0:
        return None
    return LogCut(run_id=run_id, index=index)


def history_segments(chain: Sequence["TaskRun"]) -> list[HistorySegment]:
    """The runs of a history chain, oldest first, with each edit cut applied.

    A run with a cut drops every run before it back to the run at the cut, and that run keeps only the entries
    before the cut. A cut whose run is not in the chain drops every run before it.
    """
    segments: list[HistorySegment] = []
    cut: LogCut | None = None
    for run in reversed(chain):
        end: int | None = None
        if cut is not None:
            if str(run.id) != cut.run_id:
                continue
            end = cut.index
        segments.append(HistorySegment(run=run, end=end))
        cut = log_cut_from_state(run.state)
    segments.reverse()
    return segments


def _notification(line: str) -> dict[str, Any]:
    try:
        entry = json.loads(line)
    except ValueError:
        return {}
    notification = entry.get("notification") if isinstance(entry, dict) else None
    return notification if isinstance(notification, dict) else {}


def _params(notification: Mapping[str, Any]) -> dict[str, Any]:
    params = notification.get("params")
    return params if isinstance(params, dict) else {}


def _session_update(notification: Mapping[str, Any]) -> dict[str, Any]:
    update = _params(notification).get("update")
    return update if isinstance(update, dict) else {}


def _is_hidden(block: object) -> bool:
    meta = block.get("_meta") if isinstance(block, dict) else None
    ui = meta.get("ui") if isinstance(meta, dict) else None
    return isinstance(ui, dict) and ui.get("hidden") is True


def _sent_text(notification: Mapping[str, Any]) -> str:
    """The text of a user message as it was sent, with its context blocks."""
    if notification.get("method") == "session/update":
        update = _session_update(notification)
        content = update.get("content")
        text = content.get("text") if isinstance(content, dict) else update.get("text")
        return text if isinstance(text, str) else ""
    content = _params(notification).get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block["text"]
            for block in content
            if isinstance(block, dict) and isinstance(block.get("text"), str) and not _is_hidden(block)
        )
    return ""


def _mode_update(notification: Mapping[str, Any]) -> str | None:
    if notification.get("method") != "session/update":
        return None
    update = _session_update(notification)
    if update.get("sessionUpdate") != "current_mode_update":
        return None
    mode = update.get("currentModeId") or update.get("mode")
    return mode if isinstance(mode, str) and mode else None


def _is_user_entry(notification: Mapping[str, Any]) -> bool:
    method = notification.get("method")
    if method == "_posthog/user_message":
        return True
    return method == "session/update" and _session_update(notification).get("sessionUpdate") in (
        "user_message",
        "user_message_chunk",
    )


# The same rule as `startsWithAgentCommand` in the PostHog AI frontend: a command name, then a space or the end.
_AGENT_COMMAND = re.compile(r"^/[A-Za-z][\w:.-]*(\s|$)")


def is_agent_command(text: str) -> bool:
    """Whether a message is an agent slash command such as `/compact`. App commands never reach a run log."""
    return _AGENT_COMMAND.match(text.strip()) is not None


def cleared_after(segment_entries: Sequence[Sequence[str]], index: int) -> bool:
    """Whether a `/clear` boundary follows the entry at ``index`` of the first segment's entries.

    ``segment_entries`` holds the log entries a history read keeps, for the message's run and each run after it.
    A resume keeps only the turns after the last boundary, so a message before one is not in the agent's context.
    """
    for position, entries in enumerate(segment_entries):
        for line in entries[index + 1 :] if position == 0 else entries:
            if "conversation_cleared" in line and _notification(line).get("method") == "_posthog/conversation_cleared":
                return True
    return False


def turn_is_complete(entries: Sequence[str]) -> bool:
    """Whether the agent finished the last turn in one run's log entries: a turn completion came after the
    last user message. A log with no completion yet, such as a run still booting, has no finished turn."""
    complete = False
    for line in entries:
        if "turn_complete" not in line and "user_message" not in line:
            continue
        notification = _notification(line)
        if notification.get("method") == "_posthog/turn_complete":
            complete = True
        elif _is_user_entry(notification):
            complete = False
    return complete


def _content_blocks(notification: Mapping[str, Any]) -> list[object]:
    if notification.get("method") == "session/update":
        content = _session_update(notification).get("content")
    else:
        content = _params(notification).get("content")
    if isinstance(content, list):
        return content
    return [content] if isinstance(content, dict) else []


def _artifact_from_uri(uri: str) -> AttachedArtifact | None:
    """The run and artifact a sandbox attachment path names: `.posthog/attachments/<run_id>/<artifact_id>/<name>`."""
    segments = [segment for segment in (urlparse(uri).path or uri).split("/") if segment]
    marker = len(segments) - 1 - segments[::-1].index("attachments") if "attachments" in segments else -1
    if marker < 1 or segments[marker - 1] != ".posthog" or len(segments) < marker + 4:
        return None
    return AttachedArtifact(run_id=segments[marker + 1], artifact_id=segments[marker + 2])


def _attached_artifacts(entries: Sequence[str]) -> tuple[AttachedArtifact, ...]:
    """The files of the user message whose entries open ``entries``. Its echo repeats the blocks, so each artifact
    counts once."""
    artifacts: dict[str, AttachedArtifact] = {}
    for line in entries:
        notification = _notification(line)
        if not _is_user_entry(notification):
            break
        for block in _content_blocks(notification):
            if not isinstance(block, dict) or block.get("type") not in ("resource_link", "image"):
                continue
            uri = block.get("uri")
            artifact = _artifact_from_uri(uri) if isinstance(uri, str) else None
            if artifact is not None:
                artifacts.setdefault(artifact.artifact_id, artifact)
    return tuple(artifacts.values())


def edited_message_at(entries: Sequence[str], index: int) -> EditedMessage | None:
    """The user message that opens a turn at ``index`` of one run's log entries, or ``None`` when the entry
    there is anything else."""
    if index < 0 or index >= len(entries) or "user_message" not in entries[index]:
        return None
    notification = _notification(entries[index])
    method = notification.get("method")
    human = human_text(method if isinstance(method, str) else None, _params(notification))
    if human is None or not is_turn_text(human.text):
        return None
    sent = _sent_text(notification).rstrip()
    context = sent[: len(sent) - len(human.text)].rstrip() if sent.endswith(human.text) else ""
    mode: str | None = None
    for line in entries[:index]:
        if "current_mode_update" in line and (update := _mode_update(_notification(line))) is not None:
            mode = update
    return EditedMessage(text=human.text, context=context, mode=mode, artifacts=_attached_artifacts(entries[index:]))


def edited_message_content(message: EditedMessage, text: str) -> str:
    """The new message to send in place of ``message``, with the context blocks the original carried."""
    return f"{message.context}\n\n{text}" if message.context else text
