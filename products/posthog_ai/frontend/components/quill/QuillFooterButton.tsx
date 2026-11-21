import { useValues } from 'kea'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { IconCheck, IconCopy } from '@posthog/icons'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@posthog/quill-primitives'

import { copyToClipboard } from 'lib/utils/copyToClipboard'

import { todayShellLogic } from '~/layout/today/todayShellLogic'

/**
 * Icon affordance for message and turn footers. Stays muted whether idle or active: the icon carries
 * the state, so the row never lights up in a colour the thread doesn't use elsewhere.
 */
export function QuillFooterButton({
    label,
    tooltip,
    onClick,
    dataAttr,
    disabledReason,
    children,
}: {
    label: string
    tooltip?: string
    onClick: () => void
    dataAttr?: string
    /** Disables the button and shows this reason in the tooltip instead. */
    disabledReason?: string
    children: ReactNode
}): JSX.Element {
    const { todayRailEnabled, phoneLayout } = useValues(todayShellLogic)
    return (
        <Tooltip>
            <TooltipTrigger
                delay={0}
                render={
                    <Button
                        variant="default"
                        size={todayRailEnabled && phoneLayout ? 'icon-sm' : 'icon-xs'}
                        aria-label={label}
                        // aria-disabled rather than disabled, so the tooltip with the reason still opens on hover.
                        aria-disabled={disabledReason ? true : undefined}
                        onClick={disabledReason ? undefined : onClick}
                        data-attr={dataAttr}
                        className={
                            disabledReason
                                ? 'text-muted-foreground opacity-50 cursor-not-allowed'
                                : 'text-muted-foreground hover:text-foreground'
                        }
                    >
                        {children}
                    </Button>
                }
            />
            <TooltipContent>{disabledReason ?? tooltip ?? label}</TooltipContent>
        </Tooltip>
    )
}

const COPIED_MS = 2000

export function QuillCopyButton({
    value,
    label,
    dataAttr,
}: {
    value: string
    label: string
    dataAttr?: string
}): JSX.Element {
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>()
    useEffect(() => () => clearTimeout(timer.current), [])
    return (
        <QuillFooterButton
            label={label}
            tooltip={copied ? 'Copied' : label}
            dataAttr={dataAttr}
            onClick={() => {
                void copyToClipboard(value, 'text', { silent: true })
                setCopied(true)
                clearTimeout(timer.current)
                timer.current = setTimeout(() => setCopied(false), COPIED_MS)
            }}
        >
            {copied ? <IconCheck /> : <IconCopy />}
        </QuillFooterButton>
    )
}
