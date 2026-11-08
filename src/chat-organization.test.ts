import { describe, expect, it } from 'vitest';
import type { Conversation } from './chat-api';
import { validateChatHistory } from './chat-api';
import { conversationLink, conversationText, organizeConversation, requestedConversation, sortConversations } from './chat-organization';

const chat: Conversation = { id: 'saved-chat', title: 'Physics revision', messages: [{ id: 'message', role: 'user', content: 'Explain induction', createdAt: 1 }], createdAt: 1, updatedAt: 2 };

describe('conversation organization', () => {
  it('preserves old history without inventing statuses or groups', () => {
    expect(validateChatHistory({ version: 1, conversations: [chat] })).toEqual([chat]);
  });
  it('preserves every navigation field through history validation and JSON export', () => {
    const organized = { ...chat, project: 'Exam preparation', section: 'Revision', pinned: true, unread: false, archived: true };
    expect(validateChatHistory(JSON.parse(JSON.stringify({ version: 1, conversations: [organized] })))).toEqual([organized]);
  });
  it('rejects invalid saved metadata before it can replace existing history', () => {
    for (const patch of [{ project: '' }, { section: 'line\nbreak' }, { project: 'x'.repeat(81) }, { pinned: 'true' }, { unread: 1 }, { archived: null }]) {
      expect(() => validateChatHistory({ version: 1, conversations: [{ ...chat, ...patch }] })).toThrow(/group|status/);
    }
  });
  it('applies an action to current messages instead of replacing an incoming reply', () => {
    const current = { ...chat, messages: [...chat.messages, { id: 'reply', role: 'assistant' as const, content: 'The response arrived.', createdAt: 3 }], updatedAt: 3 };
    const result = organizeConversation([current], chat.id, { pinned: true, project: 'Physics' });
    expect(result[0]).toMatchObject({ pinned: true, project: 'Physics', updatedAt: 3 });
    expect(result[0].messages).toEqual(current.messages);
    expect(current).not.toHaveProperty('pinned');
  });
  it('removes group membership and retains pinned, unread and archived state', () => {
    const current = { ...chat, project: 'Physics', section: 'Review', pinned: true, unread: true, archived: true };
    const result = organizeConversation([current], chat.id, { project: undefined, section: undefined, archived: false });
    expect(validateChatHistory({ version: 1, conversations: result })[0]).toEqual({ ...chat, pinned: true, unread: true, archived: false });
  });
  it('sorts pins before newer chats without changing the saved order', () => {
    const newer = { ...chat, id: 'newer', updatedAt: 10 };
    const pinned = { ...chat, pinned: true };
    const original = [newer, pinned];
    expect(sortConversations(original).map(item => item.id)).toEqual([chat.id, 'newer']);
    expect(original).toEqual([newer, pinned]);
  });
  it('opens the requested local conversation and otherwise skips archived history', () => {
    const archived = { ...chat, archived: true };
    const live = { ...chat, id: 'live' };
    expect(requestedConversation([archived, live], 'https://example.test/?conversation=saved-chat#Study%20Chat')).toEqual(archived);
    expect(requestedConversation([archived, live], 'https://example.test/#Study%20Chat')).toEqual(live);
    expect(requestedConversation([archived], 'https://example.test/')).toBeUndefined();
  });
  it('creates a same-origin device-local deep link preserving other URL state', () => {
    const url = new URL(conversationLink('chat / special?', 'https://example.test/app?preview=1#Today'));
    expect(url.origin).toBe('https://example.test');
    expect(url.pathname).toBe('/app');
    expect(url.searchParams.get('preview')).toBe('1');
    expect(url.searchParams.get('conversation')).toBe('chat / special?');
    expect(decodeURIComponent(url.hash)).toBe('#Study Chat');
  });
  it('copies real conversation text with explicitly included attachments and context', () => {
    const text = conversationText({ ...chat, messages: [{ ...chat.messages[0], attachments: [{ id: 'file', name: 'notes.txt', text: 'Supplied notes', size: 14, kind: 'text', pages: 1 }], contexts: [{ id: 'context', label: 'Task', text: 'Supplied task context' }] }] });
    expect(text).toContain('# Physics revision');
    expect(text).toContain('Explain induction');
    expect(text).toContain('Supplied notes');
    expect(text).toContain('Supplied task context');
  });
});
