import type { Meta, StoryObj } from '@storybook/react'

import { HumanMessageEditor, type HumanMessageEditorProps } from './HumanMessageEditor'
import { QuillHumanMessageEditor } from './quill/QuillHumanMessageEditor'
import { QuillThreadSkin } from './quill/QuillThreadSkin'

const PROPS: HumanMessageEditorProps = {
    value: 'and churn by plan?',
    onChange: () => {},
    onSave: () => {},
    onCancel: () => {},
    saving: false,
    error: 'This chat changed after it loaded. Reload it and try again.',
}

const meta: Meta<HumanMessageEditorProps> = {
    title: 'Products/PostHog AI/HumanMessageEditor',
    args: PROPS,
    parameters: {
        // A feature-local editor with no visual contract to protect, so the runner renders it without a baseline.
        testOptions: { snapshotBrowsers: [] },
    },
}
export default meta

type Story = StoryObj<HumanMessageEditorProps>

export const Lemon: Story = {
    render: (props) => (
        <div className="w-140 max-w-full p-4">
            <HumanMessageEditor {...props} />
        </div>
    ),
}

export const Quill: Story = {
    render: (props) => (
        <QuillThreadSkin className="w-140 max-w-full p-4">
            <QuillHumanMessageEditor {...props} />
        </QuillThreadSkin>
    ),
}
