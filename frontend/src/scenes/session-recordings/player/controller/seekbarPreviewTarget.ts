import { EventType, eventWithTime } from 'posthog-js/rrweb-types'

import { RecordingSegment } from '~/types'

// Inside an active segment the preview moves in steps of this size. Seeking on every pixel of mouse
// movement makes rrweb rebuild the page on each backward move, and a step this short still shows
// what the user was doing.
export const PREVIEW_STEP_MS = 5000

// A seek replays every event from the last full snapshot up to the target. Past this many events the
// seek takes longer than the 200 ms hover debounce in a headless benchmark, so the tooltip shows the
// URL instead of a frame.
export const MAX_EVENTS_TO_REPLAY = 1500

export type SeekbarPreviewTarget =
    | { kind: 'frame'; timestamp: number }
    | { kind: 'url-only'; reason: 'no-window' | 'no-full-snapshot' | 'too-many-events' }

export function seekbarPreviewTarget(
    hoverTimestamp: number,
    segment: RecordingSegment | null,
    snapshotsByWindowId: Record<number, eventWithTime[]>,
    maxEventsToReplay: number = MAX_EVENTS_TO_REPLAY
): SeekbarPreviewTarget {
    if (!segment || segment.windowId === undefined) {
        return { kind: 'url-only', reason: 'no-window' }
    }
    const events = snapshotsByWindowId[segment.windowId]
    if (!events?.length) {
        return { kind: 'url-only', reason: 'no-window' }
    }

    // The user did not interact during an inactive segment, so its first frame stands for all of it.
    const clamped = Math.min(Math.max(hoverTimestamp, segment.startTimestamp), segment.endTimestamp)
    const timestamp = segment.isActive
        ? segment.startTimestamp + Math.floor((clamped - segment.startTimestamp) / PREVIEW_STEP_MS) * PREVIEW_STEP_MS
        : segment.startTimestamp

    const replayCount = eventsToReplay(events, timestamp, maxEventsToReplay)
    if (replayCount === 'no-full-snapshot') {
        return { kind: 'url-only', reason: 'no-full-snapshot' }
    }
    if (replayCount > maxEventsToReplay) {
        return { kind: 'url-only', reason: 'too-many-events' }
    }
    return { kind: 'frame', timestamp }
}

function eventsToReplay(events: eventWithTime[], timestamp: number, limit: number): number | 'no-full-snapshot' {
    const lastIndex = lastIndexAtOrBefore(events, timestamp)
    for (let index = lastIndex, count = 1; index >= 0; index--, count++) {
        if (events[index].type === EventType.FullSnapshot) {
            return count
        }
        if (count > limit) {
            return count
        }
    }
    return 'no-full-snapshot'
}

function lastIndexAtOrBefore(events: eventWithTime[], timestamp: number): number {
    let low = 0
    let high = events.length - 1
    let found = -1
    while (low <= high) {
        const middle = Math.floor((low + high) / 2)
        if (events[middle].timestamp <= timestamp) {
            found = middle
            low = middle + 1
        } else {
            high = middle - 1
        }
    }
    return found
}

export function urlAtTimestamp(urls: { timestamp: number; url: string }[], timestamp: number): string | undefined {
    for (let i = urls.length - 1; i >= 0; i--) {
        if (i === 0 || urls[i].timestamp < timestamp) {
            return urls[i].url
        }
    }
    return undefined
}
