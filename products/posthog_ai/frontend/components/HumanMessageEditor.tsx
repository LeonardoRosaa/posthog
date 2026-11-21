import { LemonButton, LemonTextArea, Spinner } from '@posthog/lemon-ui'

import { handleMessageEditorKeyDown } from '../utils/messageEditorKeys'

export interface HumanMessageEditorProps {
    value: string
    onChange: (value: string) => void
    onSave: () => void
    onCancel: () => void
    saving: boolean
    error: string | null
    saveDisabledReason?: string
    /** What saving removes from the conversation, shown above the buttons. */
    notice?: string | null
    /** Shown while the notice is still being worked out. */
    noticeLoadingText?: string | null
}

export function HumanMessageEditor({
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
        <div className="flex flex-col gap-2 w-full" data-attr="posthog-ai-human-message-editor">
            <LemonTextArea
                value={value}
                onChange={onChange}
                onKeyDown={(event) =>
                    handleMessageEditorKeyDown(event, { onSave: () => !saveDisabledReason && onSave(), onCancel })
                }
                autoFocus
                minRows={2}
                maxRows={12}
                disabled={saving}
                aria-label="Edit message"
            />
            {noticeLoadingText ? (
                <div className="flex items-center gap-1 text-muted text-xs">
                    <Spinner textColored />
                    {noticeLoadingText}
                </div>
            ) : (
                notice && <div className="text-muted text-xs">{notice}</div>
            )}
            {error && <div className="text-danger text-xs">{error}</div>}
            <div className="flex flex-wrap justify-end gap-2">
                <LemonButton
                    type="secondary"
                    size="small"
                    onClick={onCancel}
                    disabledReason={saving ? 'Saving your edit' : undefined}
                    data-attr="posthog-ai-human-message-edit-cancel"
                >
                    Cancel
                </LemonButton>
                <LemonButton
                    type="primary"
                    size="small"
                    onClick={onSave}
                    loading={saving}
                    disabledReason={saveDisabledReason}
                    data-attr="posthog-ai-human-message-edit-save"
                >
                    Save
                </LemonButton>
            </div>
        </div>
    )
}
