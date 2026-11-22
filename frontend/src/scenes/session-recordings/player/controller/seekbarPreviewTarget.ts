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
    segments: RecordingSegment[],
    snapshotsByWindowId: Record<number, eventWithTime[]>,
    maxEventsToReplay: number = MAX_EVENTS_TO_REPLAY
): SeekbarPreviewTarget {
    const windowed = windowedSegmentAt(segments, hoverTimestamp)
    const events = windowed ? snapshotsByWindowId[windowed.windowId] : undefined
    if (!windowed || !events?.length) {
        return { kind: 'url-only', reason: 'no-window' }
    }
    const { segment } = windowed

    const clamped = Math.min(Math.max(windowed.timestamp, segment.startTimestamp), segment.endTimestamp)
    const hoverIndex = lastIndexAtOrBefore(events, clamped)
    const fullSnapshotIndex = lastFullSnapshotAtOrBefore(events, hoverIndex)
    if (fullSnapshotIndex === -1) {
        return { kind: 'url-only', reason: 'no-full-snapshot' }
    }

    // The user did not interact during an inactive segment, so its first frame stands for all of it.
    // A full snapshot inside the segment (a page load while idle) shows a different page, so the
    // target never moves back past the last full snapshot before the hovered time.
    const snapped = segment.isActive
        ? segment.startTimestamp + Math.floor((clamped - segment.startTimestamp) / PREVIEW_STEP_MS) * PREVIEW_STEP_MS
        : segment.startTimestamp
    const timestamp = Math.max(snapped, events[fullSnapshotIndex].timestamp)

    const replayCount = lastIndexAtOrBefore(events, timestamp) - fullSnapshotIndex + 1
    if (replayCount > maxEventsToReplay) {
        return { kind: 'url-only', reason: 'too-many-events' }
    }
    return { kind: 'frame', timestamp }
}

// A gap has no window to draw, so it shows the last frame of the window before it, as the main
// player does when playback reaches a gap.
function windowedSegmentAt(
    segments: RecordingSegment[],
    timestamp: number
): { segment: RecordingSegment; windowId: number; timestamp: number } | null {
    let previous: (RecordingSegment & { windowId: number }) | null = null
    for (const segment of segments) {
        if (segment.startTimestamp > timestamp) {
            break
        }
        const hasWindow = segment.windowId !== undefined
        if (timestamp <= segment.endTimestamp) {
            if (hasWindow) {
                return { segment, windowId: segment.windowId as number, timestamp }
            }
            break
        }
        if (hasWindow) {
            previous = segment as RecordingSegment & { windowId: number }
        }
    }
    return previous ? { segment: previous, windowId: previous.windowId, timestamp: previous.endTimestamp } : null
}

// Cached per events array because the hover handler calls this on every mouse move, and a scan
// back to the last full snapshot would read the whole recording when full snapshots are sparse.
const fullSnapshotIndicesCache = new WeakMap<eventWithTime[], number[]>()

function lastFullSnapshotAtOrBefore(events: eventWithTime[], index: number): number {
    let indices = fullSnapshotIndicesCache.get(events)
    if (!indices) {
        indices = events.flatMap((event, i) => (event.type === EventType.FullSnapshot ? [i] : []))
        fullSnapshotIndicesCache.set(events, indices)
    }
    let found = -1
    for (let low = 0, high = indices.length - 1; low <= high; ) {
        const middle = Math.floor((low + high) / 2)
        if (indices[middle] <= index) {
            found = indices[middle]
            low = middle + 1
        } else {
            high = middle - 1
        }
    }
    return found
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
