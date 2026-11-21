import { expectLogic } from 'kea-test-utils'

import { FEATURE_FLAGS } from 'lib/constants'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { initKeaTests } from '~/test/init'

import {
    tasksRunsEditMessageCreate,
    tasksRunsEditMessagePreviewCreate,
    tasksRunsRetrieve,
} from 'products/tasks/frontend/generated/api'
import type { TaskRunDetailDTOApi } from 'products/tasks/frontend/generated/api.schemas'

import type { ThreadItem } from '../types/streamTypes'
import {
    EDIT_BLOCKED_REASONS,
    editButtonDisabledReason,
    editSaveErrorMessage,
    messageEditBlockedReasons,
    messageEditLogic,
    removedMessagesNotice,
    runEditBlockedReason,
    type RunEditState,
} from './messageEditLogic'
import { runStreamLogic } from './runStreamLogic'

jest.mock('products/tasks/frontend/generated/api', () => ({
    tasksRunsEditMessageCreate: jest.fn(),
    tasksRunsEditMessagePreviewCreate: jest.fn(),
    tasksRunsRetrieve: jest.fn(),
}))

const ITEM: ThreadItem = {
    id: 'human-1',
    type: 'human_message',
    text: 'show signups',
    logAddress: { runId: 'run-0', index: 3 },
}

describe('messageEditLogic', () => {
    let logic: ReturnType<typeof messageEditLogic.build>
    let stream: ReturnType<typeof runStreamLogic.build>
    const onRunStarted = jest.fn()

    beforeEach(() => {
        initKeaTests()
        onRunStarted.mockReset()
        jest.mocked(tasksRunsEditMessageCreate).mockReset()
        jest.mocked(tasksRunsEditMessagePreviewCreate).mockReset().mockResolvedValue({ removed_message_count: 0 })
        // The bootstrap never answers, so the stream stays on the run each test points it at.
        jest.mocked(tasksRunsRetrieve)
            .mockReset()
            .mockImplementation(() => new Promise(() => {}))
        featureFlagLogic.mount()
        featureFlagLogic.actions.setFeatureFlags([FEATURE_FLAGS.PHAI_EDIT_MESSAGES], {
            [FEATURE_FLAGS.PHAI_EDIT_MESSAGES]: true,
        })
        stream = runStreamLogic({ streamKey: 'chat-1' })
        stream.mount()
        stream.actions.bootstrapRun({ taskId: 'task-1', runId: 'run-1' })
        stream.actions.handleTerminalStatus({ status: 'completed', replayedFromHistory: true })
        logic = messageEditLogic({ streamKey: 'chat-1', onRunStarted })
        logic.mount()
    })

    afterEach(() => {
        logic.unmount()
        stream.unmount()
    })

    const saveEdit = async (outcome: 'saveEditSuccess' | 'saveEditFailure'): Promise<void> => {
        logic.actions.startEdit(ITEM)
        logic.actions.setDraft('show weekly signups')
        await expectLogic(logic, () => logic.actions.saveEdit(ITEM)).toDispatchActions([outcome])
    }

    const IDLE: RunEditState = {
        startedFromSlack: false,
        waitingForAnswer: false,
        queuedMessageCount: 0,
        runStatus: 'completed',
        turnComplete: false,
    }

    it.each<[string, Partial<RunEditState>, string | null]>([
        ['a finished run', {}, null],
        ['a live run between turns', { runStatus: 'in_progress', turnComplete: true }, null],
        ['a live run mid-turn', { runStatus: 'in_progress' }, EDIT_BLOCKED_REASONS.replying],
        ['a run still loading', { runStatus: null }, EDIT_BLOCKED_REASONS.replying],
        ['a waiting approval or question', { waitingForAnswer: true }, EDIT_BLOCKED_REASONS.waitingAnswer],
        ['queued messages', { queuedMessageCount: 2 }, EDIT_BLOCKED_REASONS.queued],
        ['a task started from Slack', { startedFromSlack: true }, EDIT_BLOCKED_REASONS.slack],
    ])('gives the run-wide reason for %s', (_name, state, expected) => {
        expect(runEditBlockedReason({ ...IDLE, ...state })).toBe(expected)
    })

    it('blocks commands and messages before the last /clear, but not before a compaction', () => {
        const items: ThreadItem[] = [
            { id: 'old', type: 'human_message', text: 'show signups' },
            { id: 'clear-cmd', type: 'human_message', text: '/clear' },
            { id: 'cleared', type: 'conversation_cleared' },
            { id: 'kept', type: 'human_message', text: 'show churn' },
            { id: 'compact-cmd', type: 'human_message', text: '/compact' },
            { id: 'compacted', type: 'compact_boundary' },
            { id: 'path', type: 'human_message', text: '/usr/bin is missing' },
        ]

        expect(messageEditBlockedReasons(items)).toEqual({
            old: EDIT_BLOCKED_REASONS.beforeClear,
            'clear-cmd': EDIT_BLOCKED_REASONS.command,
            'compact-cmd': EDIT_BLOCKED_REASONS.command,
        })
    })

    it.each<[string, string, string | null, string | null, string | undefined]>([
        ['a message that can never be edited', 'command', 'human-1', null, EDIT_BLOCKED_REASONS.command],
        ['another message while an editor is open', 'human-3', 'human-2', null, EDIT_BLOCKED_REASONS.otherOpen],
        [
            'the open message when a turn starts',
            'human-3',
            'human-3',
            EDIT_BLOCKED_REASONS.replying,
            EDIT_BLOCKED_REASONS.replying,
        ],
        ['a message with nothing in the way', 'human-3', null, null, undefined],
    ])('gives the edit button reason for %s', (_name, itemId, editingMessageId, runReason, expected) => {
        expect(
            editButtonDisabledReason(itemId, {
                messageReasons: { command: EDIT_BLOCKED_REASONS.command },
                runReason,
                editingMessageId,
            })
        ).toBe(expected)
    })

    it.each<[string, unknown, string]>([
        [
            'a refusal from the server',
            { detail: 'This chat changed after it loaded.' },
            'This chat changed after it loaded.',
        ],
        ['a network failure', new TypeError('Failed to fetch'), "Couldn't save your edit. Try again."],
        ['an error with no detail', {}, "Couldn't save your edit. Try again."],
    ])('shows an actionable message for %s', (_name, error, expected) => {
        expect(editSaveErrorMessage(error)).toBe(expected)
    })

    it('keeps one editor open at a time, and cancelling closes it', () => {
        const other: ThreadItem = { ...ITEM, id: 'human-2', text: 'show churn' }
        logic.actions.startEdit(ITEM)
        logic.actions.setDraft('show weekly signups')

        logic.actions.startEdit(other)
        expect(logic.values).toMatchObject({ editingMessageId: 'human-1', draft: 'show weekly signups' })

        logic.actions.cancelEdit()
        expect(logic.values).toMatchObject({ editingMessageId: null, draft: '' })
    })

    it('re-enables editing once the queued messages are sent', () => {
        expect(logic.values.runEditBlockedReason).toBeNull()

        logic.actions.setEditContext(false, 1)
        expect(logic.values.runEditBlockedReason).toBe(EDIT_BLOCKED_REASONS.queued)

        logic.actions.setEditContext(false, 0)
        expect(logic.values.runEditBlockedReason).toBeNull()
    })

    it.each<[number | null, string | null]>([
        [null, null],
        [0, null],
        [1, 'Saving removes the message after this one.'],
        [4, 'Saving removes the 4 messages after this one.'],
    ])('says what saving removes when the count is %s', (count, expected) => {
        expect(removedMessagesNotice(count)).toBe(expected)
    })

    it('loads the removed-message count when the editor opens', async () => {
        jest.mocked(tasksRunsEditMessagePreviewCreate).mockResolvedValue({ removed_message_count: 3 })

        await expectLogic(logic, () => logic.actions.startEdit(ITEM))
            .toMatchValues({ removedMessageCountLoading: true, removedMessageCount: null })
            .toDispatchActions(['setRemovedMessageCount'])
            .toMatchValues({ removedMessageCountLoading: false, removedMessageCount: 3 })

        expect(tasksRunsEditMessagePreviewCreate).toHaveBeenCalledWith(
            String(stream.values.currentProjectId),
            'task-1',
            'run-1',
            { address: { run_id: 'run-0', index: 3 }, original_text: 'show signups' }
        )
    })

    it('shows no count when the preview fails', async () => {
        jest.mocked(tasksRunsEditMessagePreviewCreate).mockRejectedValue({ status: 409 })

        await expectLogic(logic, () => logic.actions.startEdit(ITEM))
            .toDispatchActions(['setRemovedMessageCount'])
            .toMatchValues({ removedMessageCountLoading: false, removedMessageCount: null })
    })

    it('drops a count that arrives after the editor closed', async () => {
        let answer: (value: { removed_message_count: number }) => void = () => {}
        const preview = new Promise<{ removed_message_count: number }>((resolve) => (answer = resolve))
        jest.mocked(tasksRunsEditMessagePreviewCreate).mockReturnValue(preview)

        logic.actions.startEdit(ITEM)
        logic.actions.cancelEdit()
        answer({ removed_message_count: 3 })
        await preview
        // One more turn of the queue lets the listener run its code after the await.
        await Promise.resolve()

        expect(logic.values).toMatchObject({ removedMessageCount: null, removedMessageCountLoading: false })
    })

    it('saves the edit at the message address and moves the thread to the new run', async () => {
        const run = { id: 'run-2', task: 'task-1', status: 'queued' } as TaskRunDetailDTOApi
        jest.mocked(tasksRunsEditMessageCreate).mockResolvedValue({ run })

        await saveEdit('saveEditSuccess')

        expect(tasksRunsEditMessageCreate).toHaveBeenCalledWith(
            String(stream.values.currentProjectId),
            'task-1',
            'run-1',
            {
                address: { run_id: 'run-0', index: 3 },
                original_text: 'show signups',
                text: 'show weekly signups',
            }
        )
        expect(logic.values).toMatchObject({ editingMessageId: null, saving: false, saveError: null })
        expect(stream.values.bootstrappedRunId).toBe('run-2')
        expect(onRunStarted).toHaveBeenCalledWith('run-2', { run, streamKey: 'chat-1', draft: '' })
    })

    it('keeps the editor open and the thread on its run when the save fails', async () => {
        jest.mocked(tasksRunsEditMessageCreate).mockRejectedValue({
            detail: 'This chat changed after it loaded. Reload it and try again.',
        })

        await saveEdit('saveEditFailure')

        expect(logic.values).toMatchObject({
            editingMessageId: 'human-1',
            draft: 'show weekly signups',
            saving: false,
            saveError: 'This chat changed after it loaded. Reload it and try again.',
        })
        expect(stream.values.bootstrappedRunId).toBe('run-1')
        expect(onRunStarted).not.toHaveBeenCalled()
    })
})
