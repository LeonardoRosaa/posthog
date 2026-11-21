import { expectLogic } from 'kea-test-utils'

import { FEATURE_FLAGS } from 'lib/constants'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { initKeaTests } from '~/test/init'

import { tasksRunsEditMessageCreate, tasksRunsRetrieve } from 'products/tasks/frontend/generated/api'
import type { TaskRunDetailDTOApi } from 'products/tasks/frontend/generated/api.schemas'

import type { ThreadItem } from '../types/streamTypes'
import { messageEditLogic } from './messageEditLogic'
import { runStreamLogic } from './runStreamLogic'

jest.mock('products/tasks/frontend/generated/api', () => ({
    tasksRunsEditMessageCreate: jest.fn(),
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
