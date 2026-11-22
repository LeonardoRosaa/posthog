import { EventType, eventWithTime } from 'posthog-js/rrweb-types'

import {
    PREVIEW_STEP_MS,
    SeekbarPreviewTarget,
    seekbarPreviewTarget,
    urlAtTimestamp,
} from 'scenes/session-recordings/player/controller/seekbarPreviewTarget'

import { RecordingSegment } from '~/types'

const WINDOW_ID = 1
const START = 1_000_000

function event(timestamp: number, type: EventType = EventType.IncrementalSnapshot): eventWithTime {
    return { timestamp, type, data: {} } as eventWithTime
}

function segment(startOffset: number, endOffset: number, isActive: boolean): RecordingSegment {
    return {
        kind: 'window',
        startTimestamp: START + startOffset,
        endTimestamp: START + endOffset,
        durationMs: endOffset - startOffset,
        windowId: WINDOW_ID,
        isActive,
    }
}

const events: eventWithTime[] = [
    event(START, EventType.FullSnapshot),
    ...Array.from({ length: 600 }, (_, i) => event(START + (i + 1) * 100)),
]

describe('seekbarPreviewTarget', () => {
    test.each<[string, RecordingSegment[], number, number, SeekbarPreviewTarget]>([
        [
            'rounds an active hover down to the step',
            [segment(0, 60_000, true)],
            12_345,
            1500,
            { kind: 'frame', timestamp: START + 2 * PREVIEW_STEP_MS },
        ],
        [
            'shows the start of an inactive segment wherever it is hovered',
            [segment(20_000, 50_000, false)],
            43_210,
            1500,
            { kind: 'frame', timestamp: START + 20_000 },
        ],
        [
            'falls back to the URL when the seek replays too many events',
            [segment(0, 60_000, true)],
            40_000,
            100,
            { kind: 'url-only', reason: 'too-many-events' },
        ],
        [
            'shows the last frame of the window before a gap',
            [segment(0, 30_000, true), { ...segment(30_000, 60_000, false), kind: 'gap', windowId: undefined }],
            45_000,
            1500,
            { kind: 'frame', timestamp: START + 30_000 },
        ],
        [
            'falls back to the URL before the first window',
            [{ ...segment(0, 10_000, false), kind: 'gap', windowId: undefined }, segment(10_000, 60_000, true)],
            5_000,
            1500,
            { kind: 'url-only', reason: 'no-window' },
        ],
    ])('%s', (_, segments, hoverOffset, maxEvents, expected) => {
        expect(seekbarPreviewTarget(START + hoverOffset, segments, { [WINDOW_ID]: events }, maxEvents)).toEqual(
            expected
        )
    })

    it('counts only the events after the most recent full snapshot', () => {
        const withLateFullSnapshot = [...events.slice(0, 500), event(START + 50_000, EventType.FullSnapshot)]

        expect(
            seekbarPreviewTarget(START + 50_000, [segment(0, 60_000, true)], { [WINDOW_ID]: withLateFullSnapshot }, 100)
        ).toEqual({ kind: 'frame', timestamp: START + 50_000 })
    })

    it.each([
        ['an inactive segment', [segment(20_000, 50_000, false)], 43_000],
        ['an active step', [segment(0, 60_000, true)], 32_000],
    ])('does not snap back past a full snapshot inside %s', (_, segments, hoverOffset) => {
        const withPageLoad = [
            ...events.slice(0, 300),
            event(START + 31_000, EventType.FullSnapshot),
            ...events.slice(310),
        ]

        expect(seekbarPreviewTarget(START + hoverOffset, segments, { [WINDOW_ID]: withPageLoad })).toEqual({
            kind: 'frame',
            timestamp: START + 31_000,
        })
    })

    it('picks the URL the user was on before the hovered moment', () => {
        const urls = [
            { timestamp: START, url: 'https://example.com/a' },
            { timestamp: START + 30_000, url: 'https://example.com/b' },
        ]

        expect([START + 10_000, START + 40_000].map((ts) => urlAtTimestamp(urls, ts))).toEqual([
            'https://example.com/a',
            'https://example.com/b',
        ])
    })
})
