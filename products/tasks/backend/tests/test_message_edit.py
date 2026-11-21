import json
import uuid

from django.test import SimpleTestCase

from parameterized import parameterized

from products.tasks.backend.logic.message_edit import (
    EditedMessage,
    edited_message_at,
    edited_message_content,
    history_segments,
)
from products.tasks.backend.models import TaskRun


def _user_message(content: object) -> str:
    return json.dumps({"notification": {"method": "_posthog/user_message", "params": {"content": content}}})


def _session_update(update: dict) -> str:
    return json.dumps({"notification": {"method": "session/update", "params": {"update": update}}})


CONTEXT = "<posthog_untrusted_context>\ninsight abc\n</posthog_untrusted_context>"


class TestHistorySegments(SimpleTestCase):
    @parameterized.expand(
        [
            ("no_cut_keeps_every_run", [None, None, None], [(0, None), (1, None), (2, None)]),
            ("cut_in_the_parent_truncates_it", [None, None, (1, 4)], [(0, None), (1, 4), (2, None)]),
            ("cut_in_an_older_run_drops_the_runs_after_it", [None, None, None, (1, 4)], [(0, None), (1, 4), (3, None)]),
            (
                "a_later_cut_applies_on_top_of_an_earlier_one",
                [None, None, None, (1, 4), (3, 2)],
                [(0, None), (1, 4), (3, 2), (4, None)],
            ),
            ("a_later_cut_can_reach_past_an_earlier_one", [None, None, (1, 4), (0, 3)], [(0, 3), (3, None)]),
            ("cut_whose_run_is_missing_drops_every_earlier_run", [None, None, "missing"], [(2, None)]),
        ]
    )
    def test_applies_edit_cuts(self, _name: str, cuts: list, expected: list[tuple[int, int | None]]) -> None:
        runs = [TaskRun(id=uuid.uuid4(), state={}) for _ in cuts]
        for run, cut in zip(runs, cuts):
            if cut == "missing":
                run.state = {"edit_cut": {"run_id": str(uuid.uuid4()), "index": 0}}
            elif cut is not None:
                run.state = {"edit_cut": {"run_id": str(runs[cut[0]].id), "index": cut[1]}}

        segments = history_segments(runs)

        self.assertEqual([(runs.index(segment.run), segment.end) for segment in segments], expected)


class TestEditedMessageAt(SimpleTestCase):
    @parameterized.expand(
        [
            ("plain_user_message", [_user_message("hello")], 0, EditedMessage(text="hello", context="", mode=None)),
            (
                "keeps_the_context_blocks_apart",
                [_user_message(f"{CONTEXT}\n\nhello")],
                0,
                EditedMessage(text="hello", context=CONTEXT, mode=None),
            ),
            (
                "reads_text_blocks",
                [_user_message([{"type": "text", "text": f"{CONTEXT}\n\nhello"}])],
                0,
                EditedMessage(text="hello", context=CONTEXT, mode=None),
            ),
            (
                "echo_form_opens_a_turn_too",
                [_session_update({"sessionUpdate": "user_message_chunk", "content": {"type": "text", "text": "hi"}})],
                0,
                EditedMessage(text="hi", context="", mode=None),
            ),
            (
                "takes_the_last_mode_set_before_the_message",
                [
                    _session_update({"sessionUpdate": "current_mode_update", "currentModeId": "plan"}),
                    _session_update({"sessionUpdate": "current_mode_update", "currentModeId": "acceptEdits"}),
                    _user_message("hello"),
                    _session_update({"sessionUpdate": "current_mode_update", "currentModeId": "default"}),
                ],
                2,
                EditedMessage(text="hello", context="", mode="acceptEdits"),
            ),
            ("assistant_entry_is_not_a_message", [_session_update({"sessionUpdate": "agent_message"})], 0, None),
            (
                "resume_prompt_is_not_a_message",
                [_user_message("You are resuming a previous conversation. Earlier turns follow.")],
                0,
                None,
            ),
            ("index_past_the_log", [_user_message("hello")], 1, None),
        ]
    )
    def test_reads_the_message(
        self, _name: str, entries: list[str], index: int, expected: EditedMessage | None
    ) -> None:
        self.assertEqual(edited_message_at(entries, index), expected)

    @parameterized.expand(
        [
            ("without_context", EditedMessage(text="a", context="", mode=None), "b"),
            ("with_context", EditedMessage(text="a", context=CONTEXT, mode=None), f"{CONTEXT}\n\nb"),
        ]
    )
    def test_new_content_keeps_the_context(self, _name: str, message: EditedMessage, expected: str) -> None:
        self.assertEqual(edited_message_content(message, "b"), expected)
