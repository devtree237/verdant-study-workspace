import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_HISTORY_KEY } from './chat-api';
import { CHAT_DATABASE_KEY, loadChatConversations, saveChatConversations } from './chat-storage';
import type { Conversation } from './chat-api';
import { getStoredValue, setStoredValue } from './db';
vi.mock('./db', () => ({ getStoredValue: vi.fn(), setStoredValue: vi.fn() }));
const chats: Conversation[] = [{ id: 'real-saved-chat', title: 'Supplied conversation', messages: [], createdAt: 1, updatedAt: 1 }];
const legacy = new Map<string, string>();
beforeEach(() => {
  legacy.clear(); vi.clearAllMocks(); vi.mocked(getStoredValue).mockResolvedValue(undefined); vi.mocked(setStoredValue).mockResolvedValue(undefined);
  vi.stubGlobal('localStorage', { getItem: (key: string) => legacy.get(key) ?? null, setItem: (key: string, value: string) => legacy.set(key, value), removeItem: (key: string) => legacy.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());
describe('durable chat migration', () => {
  it('migrates validated legacy chats to IndexedDB and retains the original backup', async () => {
    const source = JSON.stringify({ version: 1, conversations: chats }); legacy.set(CHAT_HISTORY_KEY, source);
    expect(await loadChatConversations()).toEqual({ chats, error: '' }); expect(setStoredValue).toHaveBeenCalledWith(CHAT_DATABASE_KEY, { version: 1, conversations: chats }); expect(legacy.get(CHAT_HISTORY_KEY)).toBe(source);
  });
  it('prefers the durable record over a stale legacy migration copy', async () => {
    legacy.set(CHAT_HISTORY_KEY, JSON.stringify({ version: 1, conversations: [] })); vi.mocked(getStoredValue).mockResolvedValue({ version: 1, conversations: chats });
    expect((await loadChatConversations()).chats).toEqual(chats); expect(setStoredValue).not.toHaveBeenCalled();
  });
  it('keeps usable legacy data and reports a failed migration without removing anything', async () => {
    legacy.set(CHAT_HISTORY_KEY, JSON.stringify({ version: 1, conversations: chats })); vi.mocked(setStoredValue).mockRejectedValue(new Error('Storage unavailable'));
    const result = await loadChatConversations(); expect(result.chats).toEqual(chats); expect(result.error).toContain('retained'); expect(legacy.has(CHAT_HISTORY_KEY)).toBe(true);
  });
  it('does not replace malformed stored data with an empty migration', async () => {
    legacy.set(CHAT_HISTORY_KEY, '{malformed'); const result = await loadChatConversations(); expect(result.error).toBeTruthy(); expect(result.chats).toEqual([]); expect(setStoredValue).not.toHaveBeenCalled(); expect(legacy.get(CHAT_HISTORY_KEY)).toBe('{malformed');
  });
  it('validates before writing new history, leaving storage untouched on invalid input', async () => {
    await expect(saveChatConversations([{ ...chats[0], id: '' }])).rejects.toThrow('invalid'); expect(setStoredValue).not.toHaveBeenCalled();
  });
});
