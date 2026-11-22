import { useActions, useValues } from 'kea'
import { memo, useCallback, useEffect, useRef } from 'react'

import {
    editButtonDisabledReason,
    messageEditLogic,
    type MessageEditLogicProps,
    REMOVED_MESSAGES_LOADING,
    editSaveNotice,
} from '../logics/messageEditLogic'
import type { ThreadItem } from '../types/streamTypes'
import { HumanMessageEditor } from './HumanMessageEditor'
import { LemonHumanMessage } from './LemonHumanMessage'
import { QuillHumanMessageEditor } from './quill/QuillHumanMessageEditor'
import { QuillHumanMessage } from './quill/QuillMessages'

function OpenMessageEditor({
    item,
    editing,
    quill,
    blockedReason,
}: {
    item: ThreadItem
    editing: MessageEditLogicProps
    quill: boolean
    /** A reason that appeared after the editor opened. It holds the save, and the draft stays. */
    blockedReason?: string
}): JSX.Element {
    const { draft, saving, saveError, removedMessageCount, removedMessageCountLoading, removedTurnsChangeProject } =
        useValues(messageEditLogic(editing))
    const { setDraft, cancelEdit, saveEdit } = useActions(messageEditLogic(editing))
    const trimmed = draft.trim()
    const Editor = quill ? QuillHumanMessageEditor : HumanMessageEditor
    return (
        <Editor
            value={draft}
            onChange={setDraft}
            onSave={() => saveEdit(item)}
            onCancel={cancelEdit}
            saving={saving}
            notice={editSaveNotice(removedMessageCount, removedTurnsChangeProject)}
            noticeLoadingText={removedMessageCountLoading ? REMOVED_MESSAGES_LOADING : null}
            error={saveError ?? blockedReason ?? null}
            saveDisabledReason={
                blockedReason ??
                (!trimmed
                    ? 'Write a message'
                    : trimmed === (item.text ?? '').trim()
                      ? 'Change the message to save it'
                      : undefined)
            }
        />
    )
}

export const EditableHumanMessage = memo(function EditableHumanMessage({
    item,
    editing,
    quill,
}: {
    item: ThreadItem
    editing: MessageEditLogicProps
    quill: boolean
}): JSX.Element {
    const { editingEnabled, editingMessageId, runEditBlockedReason, messageEditBlockedReasons } = useValues(
        messageEditLogic(editing)
    )
    const { startEdit } = useActions(messageEditLogic(editing))
    // A message seen only on the live stream has no log address yet, so the server could not find it.
    const editable = editingEnabled && !!item.logAddress
    const open = editable && editingMessageId === item.id
    const disabledReason = editButtonDisabledReason(item.id, {
        messageReasons: messageEditBlockedReasons,
        runReason: runEditBlockedReason,
        editingMessageId,
    })
    const onEdit = useCallback(() => startEdit(item), [startEdit, item])

    // When the editor closes, focus goes back to this message's edit button, so keyboard users stay in place.
    const containerRef = useRef<HTMLDivElement>(null)
    const wasOpen = useRef(open)
    useEffect(() => {
        if (wasOpen.current && !open) {
            containerRef.current?.querySelector<HTMLElement>('[data-attr="posthog-ai-human-message-edit"]')?.focus()
        }
        wasOpen.current = open
    }, [open])

    const Message = quill ? QuillHumanMessage : LemonHumanMessage
    return (
        <div ref={containerRef} className="contents">
            {open ? (
                <OpenMessageEditor item={item} editing={editing} quill={quill} blockedReason={disabledReason} />
            ) : (
                <Message
                    item={item}
                    onEdit={editable ? onEdit : undefined}
                    editDisabledReason={editable ? disabledReason : undefined}
                />
            )}
        </div>
    )
})
