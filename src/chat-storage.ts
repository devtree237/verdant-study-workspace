import { CHAT_HISTORY_KEY, validateChatHistory } from './chat-api';
import type { Conversation } from './chat-api';
import { getStoredValue, setStoredValue } from './db';

export const CHAT_DATABASE_KEY = 'verdant.chat.conversations.v1';
export async function loadChatConversations(): Promise<{ chats: Conversation[]; error: string }> {
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(CHAT_HISTORY_KEY); } catch { /* IndexedDB may still be available. */ }
  try {
    const saved = await getStoredValue<unknown>(CHAT_DATABASE_KEY);
    if (saved !== undefined) return { chats: validateChatHistory(saved), error: '' };
    const chats = legacy ? validateChatHistory(JSON.parse(legacy)) : [];
    if (legacy) await saveChatConversations(chats);
    // Keep the original localStorage copy as a migration backup. New writes use
    // IndexedDB only, so document-sized chats do not hit the 5MB string quota.
    return { chats, error: '' };
  } catch (cause) {
    let chats: Conversation[] = [];
    if (legacy) try { chats = validateChatHistory(JSON.parse(legacy)); } catch { /* Retain both original copies. */ }
    return { chats, error: `Chat storage could not be opened. Original saved copies were retained. Keep this tab open and export changes before leaving. ${cause instanceof Error ? cause.message : ''}` };
  }
}
export async function saveChatConversations(chats: Conversation[]): Promise<void> {
  const envelope = { version: 1, conversations: chats };
  validateChatHistory(envelope);
  await setStoredValue(CHAT_DATABASE_KEY, envelope);
}
