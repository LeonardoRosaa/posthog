import { memo } from 'react'

import { IconCopy, IconPencil } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { TZLabel } from 'lib/components/TZLabel'
import { copyToClipboard } from 'lib/utils/copyToClipboard'

import { MessageTemplate } from '../messages/MessageTemplate'
import type { ThreadItem } from '../types/streamTypes'
import { commentScreenshotNames } from '../utils/commentContext'
import { userMessageDisplayText } from '../utils/userMessageDisplay'
import { HumanMessageText } from './HumanMessageText'
import { ThreadAttachments } from './ThreadAttachments'

/** Hidden at rest so a long thread does not repeat a row under every message. */
function HumanMessageFooter({
    startedAt,
    text,
    onEdit,
    editDisabledReason,
}: {
    startedAt?: number
    text?: string
    onEdit?: () => void
    editDisabledReason?: string
}): JSX.Element {
    return (
        <div className="flex items-center gap-1 mt-1.5 mr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {startedAt !== undefined && (
                // A fresh dayjs object every render would defeat TZLabel's memo; a string compares by value.
                <TZLabel time={new Date(startedAt).toISOString()} className="text-xs text-muted" />
            )}
            {text && (
                <LemonButton
                    icon={<IconCopy />}
                    type="tertiary"
                    size="xsmall"
                    tooltip="Copy message"
                    data-attr="posthog-ai-human-message-copy"
                    onClick={() => void copyToClipboard(text)}
                />
            )}
            {onEdit && (
                <LemonButton
                    icon={<IconPencil />}
                    type="tertiary"
                    size="xsmall"
                    tooltip="Edit message"
                    aria-label="Edit message"
                    data-attr="posthog-ai-human-message-edit"
                    disabledReason={editDisabledReason}
                    onClick={onEdit}
                />
            )}
        </div>
    )
}

export const LemonHumanMessage = memo(function LemonHumanMessage({
    item,
    onEdit,
    editDisabledReason,
}: {
    item: ThreadItem
    onEdit?: () => void
    /** Shows the edit button disabled, with this reason in its tooltip. */
    editDisabledReason?: string
}): JSX.Element {
    const text = userMessageDisplayText(item.text ?? '')
    const screenshotNames = commentScreenshotNames(item.text ?? '')
    return (
        <MessageTemplate
            type="human"
            className="group"
            action={
                <HumanMessageFooter
                    startedAt={item.startedAt}
                    text={text}
                    onEdit={onEdit}
                    editDisabledReason={editDisabledReason}
                />
            }
        >
            <HumanMessageText text={item.text ?? ''} id={item.id} attachments={item.attachments} />
            {item.attachments && <ThreadAttachments attachments={item.attachments} badgeNames={screenshotNames} />}
        </MessageTemplate>
    )
})
