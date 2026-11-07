import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupWorkspace, emptyBridgeConfigs, fetchCalendarEvents, fetchWorkspaceBackup, mergeCalendarEvents, parseApiPreferences, parseCalendarEvents, serializeApiPreferences, testBridgeConnection, testChatConnection, transcribeAudio, validateBridgeConfig } from './api-services';
import { CHAT_SECRET_KEY, CHAT_SETTINGS_KEY, clearChatApiKey, initializeChatSettingsForSession, loadChatSettings } from './chat-api';
import { createEmptyState } from './model';

const config = { endpoint: 'https://bridge.example/verdant', apiKey: 'private-key' };
const signal = () => new AbortController().signal;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const requestFor = (value: unknown, status = 200) => vi.fn<typeof fetch>().mockResolvedValue(response(value, status));
afterEach(() => { vi.unstubAllGlobals(); });

describe('private API preferences', () => {
  it('persists only safe endpoints and voice preferences, never keys or URL credentials', () => {
    const configs = emptyBridgeConfigs();
    configs.voice = config;
    configs.calendar = { endpoint: 'https://user:password@bridge.example/calendar', apiKey: 'other-secret' };
    configs.storage = { endpoint: 'https://bridge.example/storage?token=url-secret', apiKey: 'storage-secret' };
    const json = serializeApiPreferences(configs, { mode: 'endpoint', language: 'hi-IN' });
    expect(json).not.toMatch(/private-key|other-secret|storage-secret|url-secret|password/);
    expect(parseApiPreferences(json)).toEqual({ configs: { voice: { endpoint: config.endpoint, apiKey: '' }, calendar: { endpoint: '', apiKey: '' }, storage: { endpoint: '', apiKey: '' } }, voiceOptions: { mode: 'endpoint', language: 'hi-IN' } });
  });
  it('rejects unsafe transport and credentials in URLs while allowing a localhost development bridge', () => {
    expect(() => validateBridgeConfig({ ...config, endpoint: 'http://example.com' })).toThrow('HTTPS');
    expect(() => validateBridgeConfig({ ...config, endpoint: 'https://example.com#secret' })).toThrow('credentials');
    expect(() => validateBridgeConfig({ ...config, apiKey: 'secret\nheader' })).toThrow('characters');
    expect(validateBridgeConfig({ endpoint: 'http://localhost:8080/', apiKey: '' }).endpoint).toBe('http://localhost:8080');
  });
  it('uses memory for new chat keys and removes old remembered secrets', () => {
    const local = new Map<string, string>([[CHAT_SECRET_KEY, 'old-secret']]), session = new Map<string, string>([[CHAT_SECRET_KEY, 'old-session']]);
    const storage = (map: Map<string, string>) => ({ getItem: (key: string) => map.get(key) || null, setItem: (key: string, value: string) => map.set(key, value), removeItem: (key: string) => map.delete(key) });
    vi.stubGlobal('localStorage', storage(local)); vi.stubGlobal('sessionStorage', storage(session)); vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    const settings = { provider: 'openai-compatible' as const, endpoint: 'https://provider.example/v1', model: 'configured-model', apiKey: 'memory-secret', rememberKey: true };
    initializeChatSettingsForSession(settings);
    expect(loadChatSettings().apiKey).toBe('memory-secret');
    expect(local.get(CHAT_SETTINGS_KEY)).not.toContain('memory-secret');
    expect(local.has(CHAT_SECRET_KEY)).toBe(false); expect(session.has(CHAT_SECRET_KEY)).toBe(false);
    clearChatApiKey(); expect(loadChatSettings().apiKey).toBe('');
  });
});

describe('real connection verification', () => {
  it('requires an authenticated capability-shaped response, not just any HTTP success', async () => {
    await expect(testBridgeConnection('calendar', config, signal(), requestFor({ ok: true }))).rejects.toThrow('calendar bridge');
    await expect(testBridgeConnection('calendar', config, signal(), requestFor({ ok: true, capabilities: ['workspace'] }))).rejects.toThrow('calendar bridge');
    const request = requestFor({ ok: true, capabilities: ['calendar'] });
    await expect(testBridgeConnection('calendar', config, signal(), request)).resolves.toEqual(config);
    expect(request).toHaveBeenCalledWith(config.endpoint + '/health', expect.objectContaining({ credentials: 'omit', redirect: 'error', headers: expect.objectContaining({ Authorization: 'Bearer private-key' }) }));
    expect(request.mock.calls[0][1]?.body).toBeUndefined();
  });
  it('checks that the configured model is returned, without sending study context or generating tokens', async () => {
    const settings = { provider: 'openai-compatible' as const, endpoint: 'https://provider.example/v1/chat/completions', model: 'my-model', apiKey: 'key', rememberKey: false };
    await expect(testChatConnection(settings, signal(), requestFor({ data: [{ id: 'different-model' }] }))).rejects.toThrow('not found');
    const request = requestFor({ data: [{ id: 'my-model' }] });
    await testChatConnection(settings, signal(), request);
    expect(request.mock.calls[0][0]).toBe('https://provider.example/v1/models');
    expect(request.mock.calls[0][1]?.body).toBeUndefined();
  });
  it('redacts server errors by never echoing provider response contents', async () => {
    await expect(testBridgeConnection('voice', config, signal(), requestFor({ error: 'private-key was invalid' }, 401))).rejects.toThrow('HTTP 401');
    try { await testBridgeConnection('voice', config, signal(), requestFor({ error: 'private-key was invalid' }, 401)); } catch (error) { expect(String(error)).not.toContain('private-key'); }
  });
  it('rejects a late response after cancellation even if the fetch implementation ignores AbortSignal', async () => {
    const controller = new AbortController();
    let finish!: (value: Response) => void;
    const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = testBridgeConnection('voice', config, controller.signal, request);
    controller.abort(); finish(response({ ok: true, capabilities: ['transcription'] }));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('connected service consumers', () => {
  it('sends a real audio file and accepts only a bounded transcript', async () => {
    const request = requestFor({ text: '  revise chemistry  ' });
    expect(await transcribeAudio(config, new Blob(['audio'], { type: 'audio/webm' }), 'en-IN', signal(), request)).toBe('revise chemistry');
    const [url, options] = request.mock.calls[0];
    expect(url).toBe(config.endpoint + '/transcribe'); expect(options?.method).toBe('POST');
    const form = options?.body as FormData;
    expect(form.get('language')).toBe('en-IN'); expect((form.get('audio') as Blob).size).toBe(5);
    await expect(transcribeAudio(config, new Blob(['x']), 'en-IN', signal(), requestFor({ text: 42 }))).rejects.toThrow('invalid transcript');
  });
  it('validates all imported events before touching tasks and deduplicates imports', async () => {
    const events = [{ id: 'one', title: 'Physics revision', start: '2026-11-06T09:00:00+05:30', end: '2026-11-06T10:00:00+05:30', subject: 'Physics' }];
    expect(() => parseCalendarEvents({ events: [...events, ...events] })).toThrow('duplicate');
    expect(() => parseCalendarEvents({ events: [{ ...events[0], end: '2026-11-06T09:00:00+05:30' }] })).toThrow('durations');
    const received = await fetchCalendarEvents(config, signal(), requestFor({ events }));
    const state = createEmptyState(); state.subjects = [{ id: 'physics', name: 'Physics', color: 'blue' }];
    const first = mergeCalendarEvents(state, received, config.endpoint);
    first.tasks[0].notes = 'Keep my notes'; first.tasks[0].stage = 'In progress';
    const second = mergeCalendarEvents(first, [{ ...received[0], title: 'Updated event' }], config.endpoint);
    expect(second.tasks).toHaveLength(1);
    expect(second.tasks[0]).toMatchObject({ title: 'Updated event', subject: 'physics', duration: 60, notes: 'Keep my notes', stage: 'In progress', labels: ['calendar-import'] });
    expect(mergeCalendarEvents(second, received, 'https://another.example').tasks).toHaveLength(2);
  });
  it('backs up only the passed study state and rejects damaged backup reads', async () => {
    const state = createEmptyState(), request = requestFor({ ok: true });
    await backupWorkspace(config, state, signal(), request);
    expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toEqual({ version: 1, workspace: state });
    await expect(fetchWorkspaceBackup(config, signal(), requestFor({ version: 1, workspace: { version: 3 } }))).rejects.toThrow('collection');
    await expect(fetchWorkspaceBackup(config, signal(), requestFor({ version: 1, workspace: state }))).resolves.toEqual(state);
  });
  it.each([
    ['subjects', { id: 'subject-without-a-name' }, 'subject'],
    ['resources', { id: 'resource-without-content' }, 'resource'],
    ['folders', { id: 'folder-without-a-parent-field' }, 'folder'],
    ['mistakes', { id: 'mistake-without-a-question' }, 'mistake'],
  ])('rejects incomplete %s from a remote backup before exposing it for restore', async (collection, record, message) => {
    const state = { ...createEmptyState(), [collection as string]: [record] };
    await expect(fetchWorkspaceBackup(config, signal(), requestFor({ version: 1, workspace: state }))).rejects.toThrow(message as string);
  });
  it('rejects folder cycles before legacy migration and accepts a valid document hierarchy', async () => {
    const folder = (id: string, parent: string | null) => ({ id, name: id, parent, subject: '', pinned: false, mastery: 0 });
    for (const version of [1, 3]) {
      for (const folders of [[folder('a', 'a')], [folder('a', 'b'), folder('b', 'a')]]) {
        const state = { ...createEmptyState(), version, folders };
        await expect(fetchWorkspaceBackup(config, signal(), requestFor({ version: 1, workspace: state }))).rejects.toThrow('parent cycle');
      }
    }
    const state = createEmptyState();
    state.subjects = [{ id: 'physics', name: 'Physics', color: 'blue' }];
    state.folders = [folder('root', null), folder('notes', 'root')];
    state.resources = [{ id: 'note', title: 'Revision notes', folder: 'notes', subject: 'physics', type: 'Note', content: 'Saved study notes', mastery: 0, pinned: false, updated: '2026-11-07' }];
    await expect(fetchWorkspaceBackup(config, signal(), requestFor({ version: 1, workspace: state }))).resolves.toEqual(state);
  });
  it('rejects broken quiz answers and nonnumeric study counters in a backup', async () => {
    const state = createEmptyState();
    state.resources = [{ id: 'quiz', title: 'Review', folder: '', subject: '', type: 'Quiz', content: '', mastery: 0, pinned: false, updated: '2026-11-07', questions: [{ prompt: 'Saved question', options: ['A', 'B'], answer: 5, explanation: '' }] }];
    await expect(fetchWorkspaceBackup(config, signal(), requestFor({ version: 1, workspace: state }))).rejects.toThrow('quiz questions');
    await expect(fetchWorkspaceBackup(config, signal(), requestFor({ version: 1, workspace: { ...createEmptyState(), focusMinutes: '90' } }))).rejects.toThrow('focus total');
  });
});
