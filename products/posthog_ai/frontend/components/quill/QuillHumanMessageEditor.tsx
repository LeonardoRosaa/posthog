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
    notice,
    noticeLoadingText,
}: HumanMessageEditorProps): JSX.Element {
    return (
        <ChatMessage align="end" data-attr="posthog-ai-human-message-editor">
            <ChatMessageContent className="gap-2 w-full">
                <Textarea
                    value={value}
                    onChange={(event) => onChange(event.currentTarget.value)}
                    onKeyDown={(event) =>
                        handleMessageEditorKeyDown(event, {
                            onSave: () => !saveDisabledReason && onSave(),
                            onCancel: () => onCancel('escape'),
                        })
                    }
                    autoFocus
                    rows={3}
                    disabled={saving}
                    aria-label="Edit message"
                    className="w-full"
                />
                {noticeLoadingText ? (
                    <div className="text-muted-foreground text-xs">{noticeLoadingText}</div>
                ) : (
                    notice && <div className="text-muted-foreground text-xs">{notice}</div>
                )}
                {error && <div className="text-destructive-foreground text-xs">{error}</div>}
                <div className="flex flex-wrap justify-end gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onCancel('button')}
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
