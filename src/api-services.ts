import { validateChatEndpoint, validateChatSettings } from './chat-api';
import type { ChatSettingsData } from './chat-api';
import type { State, Task } from './model';
import { day, validateWorkspaceState } from './model';

export type BridgeService = 'voice' | 'calendar' | 'storage';
export type ApiService = 'llm' | BridgeService;
export type BridgeConfig = { endpoint: string; apiKey: string };
export type BridgeConfigs = Record<BridgeService, BridgeConfig>;
export type VoiceOptions = { mode: 'browser' | 'endpoint'; language: string };
export const API_PREFERENCES_KEY = 'verdant.api.preferences.v1';
export const emptyBridgeConfigs = (): BridgeConfigs => ({ voice: { endpoint: '', apiKey: '' }, calendar: { endpoint: '', apiKey: '' }, storage: { endpoint: '', apiKey: '' } });
const capabilities: Record<BridgeService, string> = { voice: 'transcription', calendar: 'calendar', storage: 'workspace' };

export function validateBridgeConfig(config: BridgeConfig): BridgeConfig {
  const endpoint = validateChatEndpoint(config.endpoint);
  const apiKey = config.apiKey.trim();
  if (apiKey.length > 4096 || /[\u0000-\u001f\u007f]/.test(apiKey)) throw new Error('The API key contains unsupported characters.');
  return { endpoint, apiKey };
}

/** Only this explicit whitelist can enter persistent preferences. Keys stay in the provider's memory. */
export function serializeApiPreferences(configs: BridgeConfigs, voiceOptions: VoiceOptions) {
  return JSON.stringify({ version: 1, services: Object.fromEntries(Object.entries(configs).map(([id, config]) => {
    let endpoint = ''; try { if (config.endpoint) endpoint = validateChatEndpoint(config.endpoint); } catch { /* Do not persist a URL with embedded credentials or query tokens. */ }
    return [id, { endpoint }];
  })), voice: { mode: voiceOptions.mode, language: voiceOptions.language } });
}
export function parseApiPreferences(value: string | null): { configs: BridgeConfigs; voiceOptions: VoiceOptions } {
  const result = { configs: emptyBridgeConfigs(), voiceOptions: { mode: 'browser', language: 'en-IN' } as VoiceOptions };
  try {
    const raw = JSON.parse(value || 'null');
    if (raw?.version !== 1) return result;
    for (const id of Object.keys(result.configs) as BridgeService[]) if (typeof raw.services?.[id]?.endpoint === 'string' && raw.services[id].endpoint) {
      try { result.configs[id].endpoint = validateChatEndpoint(raw.services[id].endpoint); } catch { /* Ignore an invalid saved endpoint. */ }
    }
    if (raw.voice?.mode === 'endpoint') result.voiceOptions.mode = 'endpoint';
    if (['en-IN', 'en-US', 'en-GB', 'hi-IN'].includes(raw.voice?.language)) result.voiceOptions.language = raw.voice.language;
  } catch { /* Invalid preferences do not replace workspace data. */ }
  return result;
}

function auth(config: BridgeConfig): Record<string, string> { return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}; }
async function jsonRequest(url: string, init: RequestInit, signal: AbortSignal, request: typeof fetch): Promise<Record<string, unknown>> {
  if (signal.aborted) throw new DOMException('Connection cancelled.', 'AbortError');
  let response: Response;
  try { response = await request(url, { ...init, signal, credentials: 'omit', redirect: 'error', cache: 'no-store' }); }
  catch { if (signal.aborted) throw new DOMException('Connection cancelled or timed out.', 'AbortError'); throw new Error('Could not reach the service. Check the URL, network, and whether the endpoint allows this site through CORS.'); }
  if (signal.aborted) throw new DOMException('Connection cancelled.', 'AbortError');
  // Never display a server's raw error: it can echo credentials or private request contents.
  if (!response.ok) throw new Error(`The service returned HTTP ${response.status}. Check the endpoint and credentials.`);
  let value: unknown;
  try { value = await response.json(); } catch { throw new Error('The service did not return readable JSON.'); }
  if (signal.aborted) throw new DOMException('Connection cancelled.', 'AbortError');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The service returned an invalid JSON object.');
  return value as Record<string, unknown>;
}

export async function testBridgeConnection(service: BridgeService, config: BridgeConfig, signal: AbortSignal, request: typeof fetch = fetch) {
  const valid = validateBridgeConfig(config);
  const value = await jsonRequest(`${valid.endpoint}/health`, { headers: { ...auth(valid), Accept: 'application/json' } }, signal, request);
  if (value.ok !== true || !Array.isArray(value.capabilities) || !value.capabilities.includes(capabilities[service])) throw new Error(`This endpoint must support the Verdant ${capabilities[service]} bridge. See the connection format below.`);
  return valid;
}

export async function testChatConnection(settings: ChatSettingsData, signal: AbortSignal, request: typeof fetch = fetch) {
  const valid = validateChatSettings(settings);
  if (valid.provider === 'gemini') {
    const model = valid.model.replace(/^models\//, '');
    const value = await jsonRequest(`${valid.endpoint}/models/${encodeURIComponent(model)}`, { headers: { 'x-goog-api-key': valid.apiKey, Accept: 'application/json' } }, signal, request);
    if (value.name !== `models/${model}` || !Array.isArray(value.supportedGenerationMethods) || !value.supportedGenerationMethods.includes('generateContent')) throw new Error('The provider did not confirm a text-generation model with this ID.');
  } else {
    const base = valid.endpoint.replace(/\/chat\/completions$/, '');
    const value = await jsonRequest(`${base}/models`, { headers: { ...auth({ apiKey: valid.apiKey, endpoint: base }), Accept: 'application/json' } }, signal, request);
    if (!Array.isArray(value.data) || !value.data.some(model => model && typeof model === 'object' && (model as { id?: unknown }).id === valid.model)) throw new Error('This model was not found in the provider’s /models response. Check the model ID and read-model permission.');
  }
  return valid;
}

export async function transcribeAudio(config: BridgeConfig, audio: Blob, language: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<string> {
  const valid = validateBridgeConfig(config);
  if (!audio.size || audio.size > 25 * 1024 * 1024) throw new Error('Record between a moment and 25 MB of audio.');
  const body = new FormData();
  body.append('audio', audio, audio.type.includes('mp4') ? 'recording.mp4' : audio.type.includes('ogg') ? 'recording.ogg' : audio.type.includes('wav') ? 'recording.wav' : 'recording.webm');
  body.append('language', language);
  const value = await jsonRequest(`${valid.endpoint}/transcribe`, { method: 'POST', headers: auth(valid), body }, signal, request);
  if (typeof value.text !== 'string' || value.text.length > 50000) throw new Error('The transcription service returned an invalid transcript.');
  return value.text.trim();
}

export type CalendarBridgeEvent = { id: string; title: string; start: string; end: string; subject?: string };
export function parseCalendarEvents(value: unknown): CalendarBridgeEvent[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { events?: unknown }).events)) throw new Error('Calendar response must contain an events array.');
  const events = (value as { events: unknown[] }).events;
  if (events.length > 5000) throw new Error('Import up to 5,000 calendar events at once.');
  const ids = new Set<string>();
  return events.map(raw => {
    const event = raw as CalendarBridgeEvent;
    if (!event || typeof event.id !== 'string' || !event.id || event.id.length > 200 || ids.has(event.id) || typeof event.title !== 'string' || !event.title.trim() || event.title.length > 500) throw new Error('A calendar event has an invalid or duplicate ID or title.');
    if (typeof event.start !== 'string' || typeof event.end !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(event.start) || !/(Z|[+-]\d\d:\d\d)$/.test(event.end)) throw new Error('Calendar event times must be ISO timestamps including a time zone.');
    const start = new Date(event.start), end = new Date(event.end), minutes = (end.getTime() - start.getTime()) / 60000;
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) throw new Error('Calendar event durations must be between 1 minute and 24 hours.');
    ids.add(event.id);
    return { id: event.id, title: event.title.trim(), start: start.toISOString(), end: end.toISOString(), ...(typeof event.subject === 'string' ? { subject: event.subject } : {}) };
  });
}
export async function fetchCalendarEvents(config: BridgeConfig, signal: AbortSignal, request: typeof fetch = fetch) {
  const valid = validateBridgeConfig(config);
  return parseCalendarEvents(await jsonRequest(`${valid.endpoint}/events`, { headers: auth(valid) }, signal, request));
}
export function mergeCalendarEvents(state: State, events: CalendarBridgeEvent[], endpoint: string): State {
  // Include the source URL so two connected calendars with the same event ID never collide.
  const prefix = `calendar:${encodeURIComponent(validateChatEndpoint(endpoint))}:`;
  const next = new Map(state.tasks.map(task => [task.id, task]));
  const archived = new Set(state.taskHistory.map(task => task.id));
  for (const event of events) {
    const id = prefix + encodeURIComponent(event.id);
    if (archived.has(id)) continue;
    const previous = next.get(id), start = new Date(event.start), end = new Date(event.end);
    const subject = state.subjects.find(item => item.id === event.subject || item.name.toLowerCase() === event.subject?.toLowerCase())?.id ?? previous?.subject ?? '';
    const task: Task = { id, title: event.title, subject, priority: 4, due: day(0, start), time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`, duration: Math.round((end.getTime() - start.getTime()) / 60000), labels: ['calendar-import'], stage: 'To study', done: false, notes: '', subtasks: [] };
    next.set(id, previous ? { ...previous, title: task.title, subject, due: task.due, time: task.time, duration: task.duration } : task);
  }
  return { ...state, tasks: [...next.values()] };
}

export async function backupWorkspace(config: BridgeConfig, state: State, signal: AbortSignal, request: typeof fetch = fetch) {
  const valid = validateBridgeConfig(config);
  const value = await jsonRequest(`${valid.endpoint}/workspace`, { method: 'PUT', headers: { ...auth(valid), 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, workspace: validateWorkspaceState(state) }) }, signal, request);
  if (value.ok !== true) throw new Error('The storage service did not confirm that the backup was saved.');
}

/** A downloaded snapshot must be safe for every workspace view before it can replace local records. */
function validateWorkspaceBackup(value: unknown): State {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The workspace snapshot is not an object.');
  const raw = value as Record<string, unknown>;
  if (![1, 2, 3].includes(raw.version as number)) throw new Error('This workspace version is not supported.');
  const rows = (key: string, optional = false): Record<string, unknown>[] => {
    const records = raw[key];
    if (optional && records === undefined) return [];
    if (!Array.isArray(records)) throw new Error(`The workspace ${key} collection is missing or damaged.`);
    if (records.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error(`A saved ${key} record is damaged.`);
    return records as Record<string, unknown>[];
  };
  const text = (item: Record<string, unknown>, keys: string[]) => keys.every(key => typeof item[key] === 'string');
  const optionalText = (item: Record<string, unknown>, keys: string[]) => keys.every(key => item[key] === undefined || typeof item[key] === 'string');
  const number = (value: unknown, min = 0, max = Infinity): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const optionalNumber = (item: Record<string, unknown>, keys: string[]) => keys.every(key => item[key] === undefined || number(item[key]));
  const boolean = (item: Record<string, unknown>, keys: string[]) => keys.every(key => typeof item[key] === 'boolean');
  for (const subject of rows('subjects')) {
    if (!text(subject, ['id', 'name']) || !['green', 'blue', 'orange', 'purple'].includes(subject.color as string)) throw new Error('A saved subject is damaged. Check its name and color.');
  }
  const tasks = [...rows('tasks'), ...rows('taskHistory', raw.version !== 3)];
  for (const task of tasks) {
    if (!number(task.duration, 1) || !number(task.priority, 1, 4) || !Number.isInteger(task.priority) || !optionalText(task, ['time', 'completedAt', 'reminder', 'trackingStartedAt']) || !optionalNumber(task, ['measuredSeconds']) || (task.recurring !== undefined && typeof task.recurring !== 'boolean')) throw new Error('A saved task has invalid timing or priority.');
    if (task.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(task.time as string)) throw new Error('A saved task has an invalid clock time.');
    if (task.link !== undefined && (!task.link || typeof task.link !== 'object' || !['resource', 'mistake'].includes((task.link as { type?: string }).type || '') || typeof (task.link as { id?: unknown }).id !== 'string')) throw new Error('A saved task has a damaged linked record.');
  }
  for (const entry of rows('taskHistory', raw.version !== 3)) if (!text(entry, ['archivedAt']) || !optionalText(entry, ['subjectName', 'subjectColor'])) throw new Error('A saved task history entry is damaged.');
  for (const mistake of rows('mistakes')) {
    if (!text(mistake, ['title', 'subject', 'topic', 'category', 'prompt', 'wrong', 'solution', 'takeaway', 'review']) || !optionalText(mistake, ['image']) || !number(mistake.difficulty, 1, 5) || !number(mistake.attempts) || !['Needs review', 'In progress', 'Mastered'].includes(mistake.status as string)) throw new Error('A saved mistake is damaged.');
  }
  const folders = rows('folders');
  for (const folder of folders) {
    if (!text(folder, ['id', 'name', 'subject']) || (folder.parent !== null && typeof folder.parent !== 'string') || !boolean(folder, ['pinned']) || !number(folder.mastery, 0, 100)) throw new Error('A saved folder is damaged. Check its name and parent.');
  }
  // Check before legacy migration: its ancestor traversal also assumes an acyclic tree.
  const parents = new Map(folders.map(folder => [folder.id as string, folder.parent as string | null]));
  const depths = new Map<string, number>();
  for (const id of parents.keys()) {
    const path = new Set<string>();
    let current: string | null = id;
    while (current && !depths.has(current)) {
      if (path.has(current)) throw new Error('The backup contains a folder parent cycle. Repair the folder hierarchy before restoring.');
      if (!parents.has(current)) throw new Error('A saved folder refers to a missing parent.');
      path.add(current); current = parents.get(current) || null;
    }
    let depth = current ? depths.get(current)! : 0;
    for (const visited of [...path].reverse()) {
      if (++depth > 256) throw new Error('The backup folder hierarchy is too deeply nested to restore.');
      depths.set(visited, depth);
    }
  }
  for (const resource of rows('resources')) {
    if (!text(resource, ['title', 'folder', 'subject', 'content', 'updated']) || !['Note', 'PDF', 'Document', 'Link', 'Quiz'].includes(resource.type as string) || !boolean(resource, ['pinned']) || !number(resource.mastery, 0, 100) || !optionalText(resource, ['url', 'fileKey', 'fileName']) || !optionalNumber(resource, ['fileSize', 'pageCount']) || (resource.fileKind !== undefined && !['pdf', 'docx', 'text', 'markdown', 'latex'].includes(resource.fileKind as string))) throw new Error('A saved resource is damaged. Check its title, type, and content.');
    if (resource.questions !== undefined) {
      if (!Array.isArray(resource.questions) || resource.questions.some(question => !question || typeof question !== 'object' || !text(question, ['prompt', 'explanation']) || !Array.isArray(question.options) || question.options.length < 2 || question.options.some((option: unknown) => typeof option !== 'string') || !Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length)) throw new Error('A saved resource has damaged quiz questions.');
    }
  }
  for (const assessment of rows('assessments')) if (!text(assessment, ['title', 'subject', 'date']) || !number(assessment.score, 0, 100)) throw new Error('A saved assessment is damaged.');
  if (!number(raw.focusMinutes)) throw new Error('The saved focus total is damaged.');
  for (const session of rows('focusLog')) if (!text(session, ['date']) || !number(session.minutes)) throw new Error('A saved focus session is damaged.');
  return validateWorkspaceState(value);
}

export async function fetchWorkspaceBackup(config: BridgeConfig, signal: AbortSignal, request: typeof fetch = fetch) {
  const valid = validateBridgeConfig(config);
  const value = await jsonRequest(`${valid.endpoint}/workspace`, { headers: auth(valid) }, signal, request);
  if (value.version !== 1) throw new Error('The backup format is not supported.');
  return validateWorkspaceBackup(value.workspace);
}
