import { useActions, useValues } from 'kea'
import { memo, useCallback } from 'react'

import { messageEditLogic, type MessageEditLogicProps } from '../logics/messageEditLogic'
import type { ThreadItem } from '../types/streamTypes'
import { HumanMessageEditor } from './HumanMessageEditor'
import { LemonHumanMessage } from './LemonHumanMessage'
import { QuillHumanMessageEditor } from './quill/QuillHumanMessageEditor'
import { QuillHumanMessage } from './quill/QuillMessages'

function OpenMessageEditor({
    item,
    editing,
    quill,
}: {
    item: ThreadItem
    editing: MessageEditLogicProps
    quill: boolean
}): JSX.Element {
    const { draft, saving, saveError } = useValues(messageEditLogic(editing))
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
            error={saveError}
            saveDisabledReason={
                !trimmed
                    ? 'Write a message'
                    : trimmed === (item.text ?? '').trim()
                      ? 'Change the message to save it'
                      : undefined
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
    const { editingEnabled, editingMessageId } = useValues(messageEditLogic(editing))
    const { startEdit } = useActions(messageEditLogic(editing))
    // A message seen only on the live stream has no log address yet, so the server could not find it.
    const editable = editingEnabled && !!item.logAddress
    const onEdit = useCallback(() => startEdit(item), [startEdit, item])

    if (editable && editingMessageId === item.id) {
        return <OpenMessageEditor item={item} editing={editing} quill={quill} />
    }
    const Message = quill ? QuillHumanMessage : LemonHumanMessage
    return <Message item={item} onEdit={editable ? onEdit : undefined} />
})
