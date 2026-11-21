import { createContext } from 'react'

import type { MessageEditLogicProps } from '../logics/messageEditLogic'

/**
 * Set by a host whose user may edit the messages they sent in this thread. A thread without it, such as a
 * read-only embed or the LangGraph thread, never shows the edit button.
 */
export const MessageEditingContext = createContext<MessageEditLogicProps | null>(null)
