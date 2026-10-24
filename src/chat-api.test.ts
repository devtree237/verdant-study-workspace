import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAT_SECRET_KEY, CHAT_SETTINGS_KEY, buildChatRequest, clearChatApiKey, defaultChatSettings, messageText, saveChatSettings, sendChatMessage, validateChatEndpoint, validateChatHistory, validateChatSettings } from './chat-api';
import type { ChatMessage, ChatSettingsData } from './chat-api';

const settings = (patch: Partial<ChatSettingsData> = {}): ChatSettingsData => ({ ...defaultChatSettings(), model: 'text-model', apiKey: 'unit-test-key-not-a-real-credential', ...patch });
const message: ChatMessage = { id: 'message-id', role: 'user', content: 'Explain the attached definition.', createdAt: 1, attachments: [{ id: 'attachment-id', name: 'notes.txt', kind: 'text', text: 'A finite set has a finite number of elements.', size: 48, pages: 1 }] };
afterEach(() => vi.unstubAllGlobals());
describe('real chat provider request contract', () => {
  it('requires HTTPS outside loopback and forbids credentials in URLs', () => {
    expect(validateChatEndpoint('http://127.0.0.1:8080/v1/')).toBe('http://127.0.0.1:8080/v1');
    for (const url of ['http://example.com/v1', 'https://user:password@example.com/v1', 'https://example.com/v1?key=secret', 'https://example.com/v1#secret']) expect(() => validateChatEndpoint(url)).toThrow();
  });
  it('rejects OAuth client IDs and missing actual provider keys before any request', () => {
    expect(() => validateChatSettings(settings({ apiKey: '123-public.apps.googleusercontent.com' }))).toThrow(/OAuth client ID/);
    expect(() => buildChatRequest(settings({ apiKey: '' }), [message])).toThrow(/API key/);
    expect(() => buildChatRequest(settings({ model: '' }), [message])).toThrow(/model ID/);
  });
  it('builds Gemini contents and sends attachment text only in explicit message payloads', () => {
    const request = buildChatRequest(settings(), [message]);
    expect(request.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/text-model:generateContent');
    expect(request.url).not.toContain(settings().apiKey);
    expect(request.headers['x-goog-api-key']).toBe(settings().apiKey);
    expect(JSON.stringify(request.body)).toContain(message.attachments![0].text);
    expect(JSON.stringify(request.body)).toContain('reference data');
    expect(messageText({ content: 'A question' })).toBe('A question');
  });
  it('builds compatible chat completions with correct roles and optional localhost auth', () => {
    const request = buildChatRequest(settings({ provider: 'openai-compatible', endpoint: 'http://localhost:8080/v1', apiKey: '' }), [message]);
    expect(request.url).toBe('http://localhost:8080/v1/chat/completions');
    expect(request.headers).not.toHaveProperty('Authorization');
    expect(request.body).toMatchObject({ model: 'text-model', stream: false, messages: [{ role: 'system' }, { role: 'user' }] });
  });
  it('uses abortable authenticated requests and extracts actual returned text', async () => {
    const controller = new AbortController();
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Internal reasoning', thought: true }, { text: 'The actual answer.' }] } }] }), { status: 200 }));
    await expect(sendChatMessage(settings(), [message], controller.signal, request)).resolves.toBe('The actual answer.');
    expect(request.mock.calls[0][1]).toMatchObject({ signal: controller.signal, credentials: 'omit', redirect: 'error', method: 'POST' });
  });
  it('sanitizes echoed credentials in provider errors and preserves abort behavior', async () => {
    const key = settings().apiKey;
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: `Invalid ${key}` } }), { status: 401 }));
    await expect(sendChatMessage(settings(), [message], new AbortController().signal, request)).rejects.toThrow('[redacted]');
    const controller = new AbortController(); controller.abort();
    await expect(sendChatMessage(settings(), [message], controller.signal, vi.fn().mockRejectedValue(new TypeError('fetch failed')))).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('defaults keys to session storage and removes every stored copy on clear', () => {
    const local = new Map<string, string>(), session = new Map<string, string>();
    const storage = (map: Map<string, string>) => ({ getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => map.set(key, value), removeItem: (key: string) => map.delete(key) });
    vi.stubGlobal('localStorage', storage(local)); vi.stubGlobal('sessionStorage', storage(session)); vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    saveChatSettings(settings());
    expect(session.get(CHAT_SECRET_KEY)).toBe(settings().apiKey); expect(local.has(CHAT_SECRET_KEY)).toBe(false); expect(local.get(CHAT_SETTINGS_KEY)).not.toContain(settings().apiKey);
    saveChatSettings(settings({ rememberKey: true }));
    expect(local.get(CHAT_SECRET_KEY)).toBe(settings().apiKey); expect(session.has(CHAT_SECRET_KEY)).toBe(false);
    clearChatApiKey(); expect(local.has(CHAT_SECRET_KEY)).toBe(false); expect(session.has(CHAT_SECRET_KEY)).toBe(false);
  });
  it('validates saved message and attachment structure instead of inventing history', () => {
    expect(validateChatHistory({ version: 1, conversations: [] })).toEqual([]);
    expect(() => validateChatHistory({ version: 1, conversations: [{ id: 'chat', title: 'Saved conversation', createdAt: 1, updatedAt: 2, messages: [{ ...message, attachments: [{ name: 'broken.pdf' }] }] }] })).toThrow(/attachment/);
  });
});
