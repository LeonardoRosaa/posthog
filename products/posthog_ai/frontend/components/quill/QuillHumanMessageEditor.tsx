import { Button, ChatMessage, ChatMessageContent, Textarea } from '@posthog/quill-primitives'

import { handleMessageEditorKeyDown } from '../../utils/messageEditorKeys'
import type { HumanMessageEditorProps } from '../HumanMessageEditor'

export function QuillHumanMessageEditor({
    value,
    onChange,
    onSave,
    onCancel,
    saving,
    error,
    saveDisabledReason,
}: HumanMessageEditorProps): JSX.Element {
    return (
        <ChatMessage align="end" data-attr="posthog-ai-human-message-editor">
            <ChatMessageContent className="gap-2 w-full">
                <Textarea
                    value={value}
                    onChange={(event) => onChange(event.currentTarget.value)}
                    onKeyDown={(event) =>
                        handleMessageEditorKeyDown(event, { onSave: () => !saveDisabledReason && onSave(), onCancel })
                    }
                    autoFocus
                    rows={3}
                    disabled={saving}
                    aria-label="Edit message"
                    className="w-full"
                />
                {error && <div className="text-destructive-foreground text-xs">{error}</div>}
                <div className="flex flex-wrap justify-end gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onCancel}
                        disabled={saving}
                        data-attr="posthog-ai-human-message-edit-cancel"
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onSave}
                        loading={saving}
                        disabled={!!saveDisabledReason}
                        data-attr="posthog-ai-human-message-edit-save"
                    >
                        Save
                    </Button>
                </div>
            </ChatMessageContent>
        </ChatMessage>
    )
}
