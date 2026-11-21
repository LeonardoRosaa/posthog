import type { KeyboardEvent } from 'react'

/** Enter saves and Escape cancels the message editor. Shift+Enter and an IME composition keep typing. */
export function handleMessageEditorKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
    { onSave, onCancel }: { onSave: () => void; onCancel: () => void }
): void {
    if (event.key === 'Escape') {
        // The thread's escape boundary stops the run on Escape, so the editor keeps the key to itself.
        event.preventDefault()
        event.stopPropagation()
        onCancel()
    } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault()
        onSave()
    }
}
