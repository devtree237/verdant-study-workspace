import type { Conversation } from './chat-api';
import { messageText } from './chat-api';

export type ConversationPatch = Pick<Partial<Conversation>, 'title' | 'project' | 'section' | 'pinned' | 'unread' | 'archived'>;

/** Apply navigation changes to the latest record, preserving responses that arrived meanwhile. */
export function organizeConversation(chats: Conversation[], id: string, patch: ConversationPatch) {
  return chats.map(chat => chat.id === id ? { ...chat, ...patch } : chat);
}

export function sortConversations(chats: Conversation[]) {
  return [...chats].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
}

export function conversationLink(id: string, location: string) {
  const url = new URL(location);
  url.searchParams.set('conversation', id);
  url.hash = 'Study Chat';
  return url.toString();
}

export function requestedConversation(chats: Conversation[], location: string) {
  const requested = new URL(location).searchParams.get('conversation');
  return chats.find(chat => chat.id === requested) || chats.find(chat => !chat.archived);
}

export function conversationText(chat: Conversation) {
  return [`# ${chat.title}`, ...chat.messages.map(message => `${message.role === 'assistant' ? 'Verdant' : 'You'}\n\n${messageText(message)}`)].join('\n\n---\n\n');
}
