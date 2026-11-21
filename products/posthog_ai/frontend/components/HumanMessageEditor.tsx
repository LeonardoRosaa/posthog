import { LemonButton, LemonTextArea } from '@posthog/lemon-ui'

import { handleMessageEditorKeyDown } from '../utils/messageEditorKeys'

export interface HumanMessageEditorProps {
    value: string
    onChange: (value: string) => void
    onSave: () => void
    onCancel: () => void
    saving: boolean
    error: string | null
    saveDisabledReason?: string
}

export function HumanMessageEditor({
    value,
    onChange,
    onSave,
    onCancel,
    saving,
    error,
    saveDisabledReason,
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
