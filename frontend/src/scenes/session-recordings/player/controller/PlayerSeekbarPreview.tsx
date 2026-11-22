import { BindLogic, useActions, useValues } from 'kea'
import { MutableRefObject, memo, useEffect, useMemo, useRef, useState } from 'react'
import { useDebouncedCallback } from 'use-debounce'

import { Dayjs } from 'lib/dayjs'
import useIsHovering from 'lib/hooks/useIsHovering'
import { cn } from 'lib/utils/css-classes'
import { formatLocalizedTime } from 'lib/utils/datetime'
import { colonDelimitedDuration } from 'lib/utils/durations'

import { PlayerFrame } from '../PlayerFrame'
import { TimestampFormat } from '../playerSettingsLogic'
import {
    SessionRecordingPlayerLogicProps,
    SessionRecordingPlayerMode,
    sessionRecordingPlayerLogic,
} from '../sessionRecordingPlayerLogic'
import { seekbarPreviewTarget, urlAtTimestamp } from './seekbarPreviewTarget'

// The preview player keeps a second copy of the recorded page in memory. It is created on the first
// hover and removed after this long without one, so a viewer who never hovers pays nothing for it.
const UNMOUNT_PREVIEW_AFTER_MS = 30 * 1000

export type PlayerSeekbarPreviewProps = {
    minMs: number
    maxMs: number
    seekBarRef: MutableRefObject<HTMLDivElement | null>
    timestampFormat: TimestampFormat
    startTime: Dayjs | null
    showPreviewFrame?: boolean
}

const PlayerSeekbarPreviewFrame = ({
    targetMs,
    isVisible,
}: {
    targetMs: number | null
    isVisible: boolean
}): JSX.Element | null => {
    const { sessionRecordingId, logicProps } = useValues(sessionRecordingPlayerLogic)

    const seekPlayerLogicProps: SessionRecordingPlayerLogicProps = {
        sessionRecordingId: sessionRecordingId,
        playerKey: `${logicProps.playerKey}-preview`,
        autoPlay: false,
        mode: SessionRecordingPlayerMode.Preview,
    }

    const { setPause, seekToTime } = useActions(sessionRecordingPlayerLogic(seekPlayerLogicProps))

    const debouncedSeekToTime = useDebouncedCallback(
        (time: number) => {
            setPause()
            seekToTime(time)
        },
        200,
        {
            maxWait: 500,
        }
    )

    useEffect(() => {
        if (isVisible && targetMs !== null) {
            debouncedSeekToTime(targetMs)
        }
    }, [targetMs, isVisible]) // oxlint-disable-line react-hooks/exhaustive-deps

    // Hidden rather than unmounted when there is no frame to show, so the next hover with a frame
    // reuses the player that already exists.
    return (
        <BindLogic logic={sessionRecordingPlayerLogic} props={seekPlayerLogicProps}>
            <div className={cn('bg-red w-60 h-40', targetMs === null && 'hidden')}>
                <PlayerFrame />
            </div>
        </BindLogic>
    )
}

export const PlayerSeekbarPreview = memo(function PlayerSeekbarPreview({
    minMs,
    maxMs,
    seekBarRef,
    timestampFormat,
    startTime,
    showPreviewFrame = false,
}: PlayerSeekbarPreviewProps): JSX.Element {
    const [percentage, setPercentage] = useState<number>(0)
    const ref = useRef<HTMLDivElement>(null)
    const fixedUnits = maxMs / 1000 > 3600 ? 3 : 2

    const progressionSeconds = ((maxMs - minMs) / 1000) * percentage

    const absoluteTime = startTime?.add(progressionSeconds, 'seconds')

    const content =
        timestampFormat === TimestampFormat.Relative
            ? colonDelimitedDuration(minMs / 1000 + progressionSeconds, fixedUnits)
            : absoluteTime
              ? (timestampFormat === TimestampFormat.UTC ? absoluteTime?.tz('UTC') : absoluteTime)?.format(
                    formatLocalizedTime()
                )
              : '00:00:00'

    const isHovering = useIsHovering(seekBarRef)
    const { sessionPlayerData, urls } = useValues(sessionRecordingPlayerLogic)

    const [isPreviewMounted, setIsPreviewMounted] = useState(false)
    useEffect(() => {
        if (!showPreviewFrame) {
            setIsPreviewMounted(false)
            return
        }
        if (isHovering) {
            setIsPreviewMounted(true)
            return
        }
        const timeoutId = setTimeout(() => setIsPreviewMounted(false), UNMOUNT_PREVIEW_AFTER_MS)
        return () => clearTimeout(timeoutId)
    }, [showPreviewFrame, isHovering])

    const hoverTimestamp = (startTime?.valueOf() ?? 0) + minMs + (maxMs - minMs) * percentage
    const previewTarget = useMemo(
        () =>
            showPreviewFrame
                ? seekbarPreviewTarget(
                      hoverTimestamp,
                      sessionPlayerData.segments,
                      sessionPlayerData.snapshotsByWindowId
                  )
                : null,
        [showPreviewFrame, hoverTimestamp, sessionPlayerData.segments, sessionPlayerData.snapshotsByWindowId]
    )
    const previewTargetMs =
        previewTarget?.kind === 'frame' ? previewTarget.timestamp - (startTime?.valueOf() ?? 0) : null
    const fallbackUrl = previewTarget?.kind === 'url-only' ? urlAtTimestamp(urls, hoverTimestamp) : undefined

    const canShowPreview = showPreviewFrame && isPreviewMounted
    const isShowingFrame = canShowPreview && previewTargetMs !== null

    useEffect(() => {
        if (!seekBarRef?.current) {
            return
        }

        const handleMouseMove = (e: MouseEvent): void => {
            const rect = ref.current?.getBoundingClientRect()
            if (!rect) {
                return
            }

            const relativeX = e.clientX - rect.x
            const newPercentage = Math.max(Math.min(relativeX / rect.width, 1), 0)
            setPercentage(newPercentage)
        }

        const seekBar = seekBarRef.current
        seekBar.addEventListener('mousemove', handleMouseMove)
        return () => seekBar.removeEventListener('mousemove', handleMouseMove)
    }, [seekBarRef])

    return (
        <div className="PlayerSeekBarPreview" ref={ref}>
            <div
                className="PlayerSeekBarPreview__tooltip"
                // eslint-disable-next-line react/forbid-dom-props
                style={{
                    transform: `translateX(${percentage * 100}%)`,
                }}
            >
                <div
                    className={cn(
                        'PlayerSeekBarPreview__tooltip__content',
                        isShowingFrame && 'PlayerSeekBarPreview__tooltip__content--with-preview'
                    )}
                >
                    {canShowPreview && <PlayerSeekbarPreviewFrame targetMs={previewTargetMs} isVisible={isHovering} />}
                    <div className="text-center p-2">{content}</div>
                    {fallbackUrl ? (
                        <div className="max-w-60 truncate px-2 pb-2 text-center font-normal opacity-75">
                            {fallbackUrl}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
})
