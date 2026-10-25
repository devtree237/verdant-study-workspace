/** Browser integrity records are observations, not proof of misconduct. */
export type IntegrityPolicy = {
  mode: 'practice' | 'guarded'; requireFullscreen: boolean; trackFocus: boolean;
  restrictClipboard: boolean; restrictContextMenu: boolean;
  shuffleQuestions: boolean; shuffleOptions: boolean; autoSubmitAfter: number | null;
};
export type IntegrityEventKind = 'guard-started' | 'focus-loss' | 'fullscreen-exit' | 'clipboard-blocked' | 'contextmenu-blocked' | 'print-blocked' | 'auto-submit';
export type IntegrityEventDetail = 'initial' | 'resumed' | 'hidden' | 'window-blur' | 'copy' | 'paste' | 'cut' | 'context-menu' | 'print' | 'threshold' | 'escape-or-browser';
export type IntegrityEvent = { id: string; at: number; kind: IntegrityEventKind; questionId?: string; detail?: IntegrityEventDetail };
export type TestIntegrity = { version: 1; policy: IntegrityPolicy; events: IntegrityEvent[] };

export const DEFAULT_INTEGRITY_POLICY: Readonly<IntegrityPolicy> = Object.freeze({ mode: 'practice', requireFullscreen: false, trackFocus: false, restrictClipboard: false, restrictContextMenu: false, shuffleQuestions: false, shuffleOptions: false, autoSubmitAfter: null });
export const GUARDED_INTEGRITY_POLICY: Readonly<IntegrityPolicy> = Object.freeze({ ...DEFAULT_INTEGRITY_POLICY, mode: 'guarded', requireFullscreen: true, trackFocus: true });
export const INCIDENT_DEDUPE_MS = 1500;
const kinds = new Set<IntegrityEventKind>(['guard-started', 'focus-loss', 'fullscreen-exit', 'clipboard-blocked', 'contextmenu-blocked', 'print-blocked', 'auto-submit']);
const details = new Set<IntegrityEventDetail>(['initial', 'resumed', 'hidden', 'window-blur', 'copy', 'paste', 'cut', 'context-menu', 'print', 'threshold', 'escape-or-browser']);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const checkedText = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error(`${label} must contain 1–200 characters.`);
  return value;
};

export function validateIntegrityPolicy(value: unknown): IntegrityPolicy {
  if (value === undefined) return { ...DEFAULT_INTEGRITY_POLICY };
  if (!isRecord(value) || !['practice', 'guarded'].includes(value.mode as string)) throw new Error('Choose practice or guarded test mode.');
  const mode = value.mode as IntegrityPolicy['mode'], defaults = mode === 'guarded' ? GUARDED_INTEGRITY_POLICY : DEFAULT_INTEGRITY_POLICY;
  const boolean = (key: keyof IntegrityPolicy) => {
    if (value[key] === undefined) return defaults[key] as boolean;
    if (typeof value[key] !== 'boolean') throw new Error(`Integrity setting ${key} must be true or false.`);
    return value[key] as boolean;
  };
  const requireFullscreen = boolean('requireFullscreen'), trackFocus = boolean('trackFocus'), restrictClipboard = boolean('restrictClipboard'), restrictContextMenu = boolean('restrictContextMenu');
  const autoSubmitAfter = value.autoSubmitAfter === undefined ? null : value.autoSubmitAfter;
  if (autoSubmitAfter !== null && (typeof autoSubmitAfter !== 'number' || !Number.isInteger(autoSubmitAfter) || autoSubmitAfter < 1 || autoSubmitAfter > 50)) throw new Error('The automatic submission limit must be 1–50 incidents, or disabled.');
  return { mode, requireFullscreen: mode === 'guarded' && requireFullscreen, trackFocus: mode === 'guarded' && trackFocus, restrictClipboard: mode === 'guarded' && restrictClipboard, restrictContextMenu: mode === 'guarded' && restrictContextMenu, shuffleQuestions: boolean('shuffleQuestions'), shuffleOptions: boolean('shuffleOptions'), autoSubmitAfter: mode === 'guarded' ? autoSubmitAfter as number | null : null };
}

export function createTestIntegrity(policy: IntegrityPolicy = { ...DEFAULT_INTEGRITY_POLICY }): TestIntegrity {
  return { version: 1, policy: validateIntegrityPolicy(policy), events: [] };
}

export function validateIntegrityEvent(value: unknown): IntegrityEvent {
  if (!isRecord(value)) throw new Error('An integrity event must be an object.');
  if (typeof value.at !== 'number' || !Number.isFinite(value.at) || value.at < 0 || value.at > Number.MAX_SAFE_INTEGER) throw new Error('An integrity event needs a valid timestamp.');
  if (!kinds.has(value.kind as IntegrityEventKind)) throw new Error('This integrity event kind is unsupported.');
  if (value.detail !== undefined && !details.has(value.detail as IntegrityEventDetail)) throw new Error('This integrity event detail is unsupported.');
  // Only canonical observation fields are returned; typed content and URLs are never retained.
  return { id: checkedText(value.id, 'Integrity event ID'), at: value.at, kind: value.kind as IntegrityEventKind, ...(value.questionId === undefined ? {} : { questionId: checkedText(value.questionId, 'Integrity question ID') }), ...(value.detail === undefined ? {} : { detail: value.detail as IntegrityEventDetail }) };
}

export function validateTestIntegrity(value: unknown): TestIntegrity {
  if (value === undefined) return createTestIntegrity();
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.events) || value.events.length > 10000) throw new Error('This test integrity record is invalid or too large.');
  const events = value.events.map(validateIntegrityEvent), ids = new Set<string>();
  let lastAt = -1;
  for (const event of events) {
    if (ids.has(event.id)) throw new Error('Integrity event IDs must be unique.');
    if (event.at < lastAt) throw new Error('Integrity events must be in timestamp order.');
    ids.add(event.id); lastAt = event.at;
  }
  return { version: 1, policy: validateIntegrityPolicy(value.policy), events };
}

export function isIntegrityIncident(event: Pick<IntegrityEvent, 'kind'>): boolean {
  return event.kind === 'focus-loss' || event.kind === 'fullscreen-exit';
}

/** Coalesces browser blur/visibility/fullscreen bursts and repeated blocked keys.
 * Distinct observations remain after the cooldown; imported event IDs are stable. */
export function appendIntegrityEvent(integrity: TestIntegrity, value: IntegrityEvent): TestIntegrity {
  const event = validateIntegrityEvent(value), events = integrity.events;
  if (events.some(previous => previous.id === event.id)) return integrity;
  if (events.length >= 10000) return integrity;
  const last = events[events.length - 1];
  if (last && event.at < last.at) throw new Error('Integrity events must be in timestamp order.');
  if (isIntegrityIncident(event)) {
    const previous = [...events].reverse().find(isIntegrityIncident);
    if (previous && event.at - previous.at <= INCIDENT_DEDUPE_MS) return integrity;
  } else if (last?.kind === event.kind && last.detail === event.detail && event.at - last.at <= INCIDENT_DEDUPE_MS) return integrity;
  return { ...integrity, events: [...events, event] };
}

export function countIntegrityIncidents(events: IntegrityEvent[]): number {
  let count = 0, lastAt = -Infinity;
  for (const event of events) if (isIntegrityIncident(event) && event.at - lastAt > INCIDENT_DEDUPE_MS) { count++; lastAt = event.at; }
  return count;
}

export function shouldAutoSubmit(integrity: TestIntegrity): boolean {
  return integrity.policy.mode === 'guarded' && integrity.policy.autoSubmitAfter !== null && countIntegrityIncidents(integrity.events) >= integrity.policy.autoSubmitAfter && !integrity.events.some(event => event.kind === 'auto-submit');
}

export function integrityEventLabel(event: IntegrityEvent): string {
  if (event.kind === 'guard-started') return event.detail === 'resumed' ? 'Guarded session resumed' : 'Guarded session started';
  if (event.kind === 'focus-loss') return event.detail === 'hidden' ? 'Test page was hidden' : 'Window focus change acknowledged';
  if (event.kind === 'fullscreen-exit') return 'Fullscreen was left';
  if (event.kind === 'clipboard-blocked') return `${event.detail === 'paste' ? 'Paste' : event.detail === 'cut' ? 'Cut' : 'Copy'} blocked by the selected policy`;
  if (event.kind === 'contextmenu-blocked') return 'Context menu blocked by the selected policy';
  if (event.kind === 'print-blocked') return 'Print shortcut blocked by the selected policy';
  return 'Selected incident limit reached; automatic submission requested';
}
