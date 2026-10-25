import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Maximize2, ShieldCheck, ShieldOff } from 'lucide-react';
import { appendIntegrityEvent, countIntegrityIncidents, DEFAULT_INTEGRITY_POLICY, GUARDED_INTEGRITY_POLICY, integrityEventLabel, shouldAutoSubmit } from './cbt-integrity';
import type { IntegrityEvent, IntegrityEventDetail, IntegrityEventKind, IntegrityPolicy, TestIntegrity } from './cbt-integrity';
import './cbt-integrity.css';

export type IntegrityStartResult = { ok: boolean; reason?: 'unsupported' | 'denied'; message?: string };
export type IntegrityStatus = 'practice' | 'ready' | 'needs-fullscreen' | 'unsupported' | 'requesting';

/** Call directly from a Start/Resume button. Fullscreen needs user activation;
 * a rejected request never silently downgrades the selected test policy. */
export async function requestExamFullscreen(policy: IntegrityPolicy, element: HTMLElement = document.documentElement): Promise<IntegrityStartResult> {
  if (policy.mode === 'practice' || !policy.requireFullscreen) return { ok: true };
  if (typeof element.requestFullscreen !== 'function' || document.fullscreenEnabled === false) return { ok: false, reason: 'unsupported', message: 'Fullscreen is unavailable in this browser or embedded view. Open the site in a supported browser, or choose Practice before starting.' };
  if (document.fullscreenElement === element) return { ok: true };
  try { await element.requestFullscreen({ navigationUI: 'hide' }); return document.fullscreenElement === element ? { ok: true } : { ok: false, reason: 'denied', message: 'Fullscreen did not start. Allow fullscreen and try again, or choose Practice before starting.' }; }
  catch { return { ok: false, reason: 'denied', message: 'Fullscreen could not start. Allow fullscreen and try again, or choose Practice before starting.' }; }
}

export type CbtIntegrityOptions = {
  attemptId: string; active: boolean; policy: IntegrityPolicy; events: IntegrityEvent[];
  questionId?: string; onEvent: (event: IntegrityEvent) => void;
  onAutoSubmit: () => void | Promise<void>; suspended?: boolean;
};
export type CbtIntegrityController = {
  status: IntegrityStatus; notice: string | null; incidentCount: number;
  startGuard: () => Promise<boolean>; acknowledge: () => void;
  suppressFor: (milliseconds?: number) => void; runTrustedAction: <T>(action: () => T) => T;
};
type PendingFocus = { at: number; reason: 'hidden' | 'window-blur' | 'fullscreen' };

export function useCbtIntegrity(options: CbtIntegrityOptions): CbtIntegrityController {
  const latest = useRef(options); latest.current = options;
  const events = useRef(options.events); events.current = options.events;
  const [status, setStatus] = useState<IntegrityStatus>(options.policy.mode === 'practice' ? 'practice' : options.policy.requireFullscreen && !document.fullscreenElement ? 'needs-fullscreen' : 'ready');
  const [notice, setNotice] = useState<string | null>(null);
  const [, rerender] = useState(0);
  const armed = useRef(false), alive = useRef(false), autoSubmitted = useRef(false), started = useRef(false);
  const startedAttempt = useRef(options.attemptId);
  const pending = useRef<PendingFocus | null>(null), suppressedUntil = useRef(0), ownedFullscreen = useRef<Element | null>(null);
  const generation = useRef(0), startPromise = useRef<Promise<boolean> | null>(null);
  const emit = useRef<(kind: IntegrityEventKind, detail?: IntegrityEventDetail, at?: number) => boolean>(() => false);

  const suppressFor = useCallback((milliseconds = 1800) => {
    suppressedUntil.current = Math.max(suppressedUntil.current, Date.now() + Math.max(0, Math.min(10000, milliseconds)));
    pending.current = null;
  }, []);
  const runTrustedAction = useCallback(<T,>(action: () => T): T => { suppressFor(); try { return action(); } finally { suppressFor(); } }, [suppressFor]);

  emit.current = (kind, detail, at = Date.now()) => {
    const current = latest.current;
    if (!current.active || current.policy.mode !== 'guarded') return false;
    const timestamp = Math.max(at, events.current[events.current.length - 1]?.at || 0);
    const event: IntegrityEvent = { id: crypto.randomUUID(), at: timestamp, kind, ...(current.questionId ? { questionId: current.questionId } : {}), ...(detail ? { detail } : {}) };
    const before: TestIntegrity = { version: 1, policy: current.policy, events: events.current };
    const after = appendIntegrityEvent(before, event);
    if (after === before) return false;
    events.current = after.events;
    current.onEvent(event);
    if (alive.current) rerender(value => value + 1);
    if (shouldAutoSubmit(after) && !autoSubmitted.current) {
      autoSubmitted.current = true;
      emit.current('auto-submit', 'threshold', timestamp);
      try { Promise.resolve(current.onAutoSubmit()).catch(() => { if (alive.current) setNotice('Automatic submission could not finish. Use Submit test to save this attempt.'); }); }
      catch { if (alive.current) setNotice('Automatic submission could not finish. Use Submit test to save this attempt.'); }
    }
    return true;
  };

  const recordStart = useCallback(() => {
    if (started.current) return;
    started.current = true;
    emit.current('guard-started', events.current.some(event => event.kind === 'guard-started') ? 'resumed' : 'initial');
  }, []);
  const startGuard = useCallback((): Promise<boolean> => {
    if (startPromise.current) return startPromise.current;
    const current = latest.current;
    if (!current.active) return Promise.resolve(false);
    if (pending.current?.reason === 'fullscreen') emit.current('fullscreen-exit', 'escape-or-browser');
    suppressFor(2200); setNotice(null); setStatus('requesting');
    const request = (async () => {
      const result = await requestExamFullscreen(current.policy);
      if (!alive.current || !latest.current.active) {
        if (result.ok && current.policy.requireFullscreen && document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => undefined);
        return false;
      }
      if (!result.ok) { armed.current = false; setStatus(result.reason === 'unsupported' ? 'unsupported' : 'needs-fullscreen'); setNotice(result.reason === 'unsupported' ? 'Fullscreen is unavailable in this browser or embedded view. Your responses remain saved; use Submit test if fullscreen cannot be restored.' : 'Fullscreen could not start. Allow fullscreen and try again. The test countdown continues.'); return false; }
      if (current.policy.requireFullscreen) ownedFullscreen.current = document.fullscreenElement;
      armed.current = current.policy.mode === 'guarded'; setStatus(current.policy.mode === 'practice' ? 'practice' : 'ready'); recordStart();
      return true;
    })();
    startPromise.current = request;
    void request.finally(() => { startPromise.current = null; });
    return request;
  }, [recordStart, suppressFor]);

  const acknowledge = useCallback(() => {
    const observation = pending.current;
    if (observation?.reason === 'window-blur') emit.current('focus-loss', 'window-blur');
    else if (observation?.reason === 'fullscreen') emit.current('fullscreen-exit', 'escape-or-browser');
    pending.current = null; setNotice(null);
  }, []);

  useEffect(() => {
    const run = ++generation.current;
    alive.current = true; armed.current = false; pending.current = null;
    if (startedAttempt.current !== options.attemptId) { started.current = false; startedAttempt.current = options.attemptId; }
    autoSubmitted.current = latest.current.events.some(event => event.kind === 'auto-submit');
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, milliseconds: number) => { const timer = setTimeout(() => { timers.delete(timer); if (alive.current) fn(); }, milliseconds); timers.add(timer); };
    const exitOwned = () => { if (ownedFullscreen.current && document.fullscreenElement === ownedFullscreen.current) void document.exitFullscreen().catch(() => undefined); ownedFullscreen.current = null; };
    if (!options.active || options.policy.mode === 'practice') {
      setStatus('practice'); setNotice(null); exitOwned();
      return () => { alive.current = false; };
    }
    // Ignore the transition into an app-owned dialog, not its whole lifetime:
    // leaving the browser while instructions remain open is still observable.
    const suppressed = () => Date.now() < suppressedUntil.current;
    const settle = () => {
      if (!pending.current || document.visibilityState === 'hidden' || !document.hasFocus()) return;
      if (suppressed()) { pending.current = null; return; }
      const observation = pending.current, elapsed = Date.now() - observation.at;
      if (observation.reason === 'fullscreen') {
        pending.current = null; emit.current('fullscreen-exit', 'escape-or-browser');
        setNotice('Fullscreen was left. Enter fullscreen to continue with the selected guarded policy.');
      } else if (observation.reason === 'hidden') {
        pending.current = null;
        if (elapsed < 650) return;
        emit.current('focus-loss', 'hidden');
        setNotice('The test page was hidden. This browser observation has been recorded; return your attention to the test.');
      } else {
        if (elapsed < 900) { pending.current = null; return; }
        // Window blur alone is ambiguous (including browser permission dialogs).
        // It remains a pending notice, and counts only after explicit acknowledgement.
        setNotice('This window lost focus. Browser dialogs can also cause this. Acknowledge to record your return to the test.');
      }
    };
    const blur = () => {
      if (!armed.current || !latest.current.policy.trackFocus || suppressed()) return;
      if (!pending.current) pending.current = { at: Date.now(), reason: 'window-blur' };
      later(settle, 950);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        if (!armed.current || !latest.current.policy.trackFocus || suppressed()) return;
        if (pending.current?.reason !== 'fullscreen') pending.current = { at: pending.current?.at || Date.now(), reason: 'hidden' };
      } else later(settle, 180);
    };
    const focus = () => later(settle, 180);
    let wasFullscreen = document.fullscreenElement === document.documentElement;
    const fullscreen = () => {
      const isFullscreen = document.fullscreenElement === document.documentElement;
      if (isFullscreen) { ownedFullscreen.current = document.fullscreenElement; armed.current = true; setStatus('ready'); recordStart(); }
      else if (wasFullscreen && latest.current.policy.requireFullscreen) {
        const ignored = suppressed(); armed.current = false; setStatus('needs-fullscreen');
        if (!ignored) { pending.current = { at: pending.current?.at || Date.now(), reason: 'fullscreen' }; later(settle, 180); }
      }
      wasFullscreen = isFullscreen;
    };
    const inExam = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-cbt-exam],.exam-workspace');
    const guardClipboard = (event: ClipboardEvent) => {
      if (!armed.current || !latest.current.policy.restrictClipboard || suppressed() || !inExam(event.target)) return;
      event.preventDefault(); emit.current('clipboard-blocked', event.type as 'copy' | 'paste' | 'cut');
      setNotice(`${event.type === 'paste' ? 'Paste' : event.type === 'cut' ? 'Cut' : 'Copy'} is disabled by this test’s selected policy. No clipboard content was read.`);
    };
    const contextmenu = (event: MouseEvent) => {
      if (!armed.current || !latest.current.policy.restrictContextMenu || suppressed() || !inExam(event.target)) return;
      event.preventDefault(); emit.current('contextmenu-blocked', 'context-menu'); setNotice('The context menu is disabled by this test’s selected policy.');
    };
    const keyboard = (event: KeyboardEvent) => {
      if (!armed.current || !latest.current.policy.restrictClipboard || suppressed() || !inExam(event.target) || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (!['c', 'v', 'x', 'p'].includes(key)) return;
      event.preventDefault();
      if (key === 'p') { emit.current('print-blocked', 'print'); setNotice('The print shortcut is disabled by this test’s selected policy.'); }
      else { const detail = key === 'c' ? 'copy' : key === 'v' ? 'paste' : 'cut'; emit.current('clipboard-blocked', detail); setNotice('Copy, cut and paste are disabled by this test’s selected policy. No clipboard content was read.'); }
    };
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('fullscreenchange', fullscreen);
    window.addEventListener('blur', blur); window.addEventListener('focus', focus);
    document.addEventListener('copy', guardClipboard, true); document.addEventListener('cut', guardClipboard, true); document.addEventListener('paste', guardClipboard, true);
    document.addEventListener('contextmenu', contextmenu, true); document.addEventListener('keydown', keyboard, true);
    if (options.policy.requireFullscreen) {
      if (wasFullscreen) { ownedFullscreen.current = document.fullscreenElement; armed.current = true; setStatus('ready'); recordStart(); }
      else setStatus(typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled !== false ? 'needs-fullscreen' : 'unsupported');
    } else { armed.current = true; setStatus('ready'); recordStart(); }
    return () => {
      alive.current = false; armed.current = false; timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', visibility); document.removeEventListener('fullscreenchange', fullscreen);
      window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
      document.removeEventListener('copy', guardClipboard, true); document.removeEventListener('cut', guardClipboard, true); document.removeEventListener('paste', guardClipboard, true);
      document.removeEventListener('contextmenu', contextmenu, true); document.removeEventListener('keydown', keyboard, true);
      // Let React StrictMode's immediate replacement effect claim the session first.
      queueMicrotask(() => { if (generation.current === run) exitOwned(); });
    };
  }, [options.attemptId, options.active, options.policy.mode, options.policy.requireFullscreen, recordStart]);

  useEffect(() => { if (options.suspended) suppressFor(1200); }, [options.suspended, suppressFor]);
  return { status, notice, incidentCount: countIntegrityIncidents(events.current), startGuard, acknowledge, suppressFor, runTrustedAction };
}

export function IntegrityPolicyFields({ policy, onChange, disabled = false }: { policy: IntegrityPolicy; onChange: (policy: IntegrityPolicy) => void; disabled?: boolean }) {
  const guarded = policy.mode === 'guarded';
  const setMode = (mode: IntegrityPolicy['mode']) => onChange({ ...(mode === 'guarded' ? GUARDED_INTEGRITY_POLICY : DEFAULT_INTEGRITY_POLICY), shuffleQuestions: policy.shuffleQuestions, shuffleOptions: policy.shuffleOptions });
  const toggle = (key: 'requireFullscreen' | 'trackFocus' | 'restrictClipboard' | 'restrictContextMenu' | 'shuffleQuestions' | 'shuffleOptions', title: string, description: string, guardedOnly = false) => <label className="integrity-option" key={key}><input type="checkbox" checked={policy[key]} disabled={disabled || guardedOnly && !guarded} onChange={event => onChange({ ...policy, [key]: event.target.checked })} /><span><b>{title}</b><small>{description}</small></span></label>;
  return <fieldset className="integrity-policy" disabled={disabled}><legend>Test mode and integrity settings</legend><div className="integrity-mode-options"><label className={guarded ? '' : 'selected'}><input type="radio" name="integrity-mode" checked={!guarded} onChange={() => setMode('practice')} /><ShieldOff size={18} /><span><b>Practice</b><small>Open study, without browser monitoring.</small></span></label><label className={guarded ? 'selected' : ''}><input type="radio" name="integrity-mode" checked={guarded} onChange={() => setMode('guarded')} /><ShieldCheck size={18} /><span><b>Guarded</b><small>Use the browser checks selected below.</small></span></label></div><div className="integrity-options">{toggle('requireFullscreen', 'Require fullscreen', 'Starting and resuming require a successful fullscreen request.', true)}{toggle('trackFocus', 'Record focus changes', 'Records hidden pages; window-only focus changes require acknowledgement.', true)}{toggle('restrictClipboard', 'Restrict clipboard and print shortcut', 'Blocks copy, cut, paste and Ctrl/⌘+P inside the test; clipboard contents are never read.', true)}{toggle('restrictContextMenu', 'Restrict context menu', 'Disables right-click and the context-menu key inside the test.', true)}{toggle('shuffleQuestions', 'Shuffle questions', 'Creates a fixed shuffled order for this attempt.')}{toggle('shuffleOptions', 'Shuffle answer options', 'Creates a fixed option order while keeping the answer key mapped.')}</div><div className="integrity-auto-submit"><label><input type="checkbox" checked={guarded && policy.autoSubmitAfter !== null} disabled={!guarded || disabled} onChange={event => onChange({ ...policy, autoSubmitAfter: event.target.checked ? 3 : null })} /><span>Automatically submit after a chosen incident limit</span></label>{guarded && policy.autoSubmitAfter !== null && <label className="integrity-limit">Distinct focus/fullscreen incidents<input type="number" min={1} max={50} step={1} value={policy.autoSubmitAfter} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 50) onChange({ ...policy, autoSubmitAfter: value }); }} /></label>}</div><p className="integrity-privacy">{guarded ? 'Only event type, time and question context are recorded. These observations can have innocent causes and do not prove misconduct. Fullscreen cannot prevent other devices or all browser actions.' : 'Practice mode leaves fullscreen, clipboard and focus monitoring off. Shuffling can still be enabled.'} No webcam, typed content, URLs or screen recordings are collected.</p></fieldset>;
}

export function IntegrityBanner({ controller, policy }: { controller: CbtIntegrityController; policy: IntegrityPolicy }) {
  const needsFullscreen = policy.mode === 'guarded' && policy.requireFullscreen && controller.status !== 'ready';
  return <section className={`integrity-banner ${controller.notice || needsFullscreen ? 'has-warning' : ''}`} aria-label="Test integrity status"><div className="integrity-banner-summary">{policy.mode === 'guarded' ? <ShieldCheck size={17} /> : <ShieldOff size={17} />}<span><b>{policy.mode === 'guarded' ? 'Guarded session' : 'Practice session'}</b><small>{policy.mode === 'practice' ? 'Browser monitoring is off.' : `${controller.incidentCount} distinct focus/fullscreen incident${controller.incidentCount === 1 ? '' : 's'}${policy.autoSubmitAfter === null ? ' · automatic submission off' : ` · limit ${policy.autoSubmitAfter}`}`}</small></span>{policy.requireFullscreen && controller.status === 'ready' && <span className="integrity-ready">Fullscreen active</span>}</div>{needsFullscreen && <div className="integrity-fullscreen-notice"><AlertTriangle size={15} /><p>{controller.status === 'unsupported' ? 'Fullscreen is unavailable here. Your responses remain saved and the countdown continues; use Submit test if fullscreen cannot be restored.' : 'This guarded test requires fullscreen. Enter fullscreen to continue; the test timer keeps running.'}</p><button type="button" className="button tonal small" onClick={() => void controller.startGuard()} disabled={controller.status === 'requesting' || controller.status === 'unsupported'}><Maximize2 size={14} />{controller.status === 'requesting' ? 'Opening…' : 'Enter fullscreen'}</button></div>}{controller.notice && <div className="integrity-notice" role="status"><p>{controller.notice}</p><button type="button" className="text-link" onClick={controller.acknowledge}>Acknowledge</button></div>}</section>;
}

export function IntegritySummary({ integrity, startedAt, questionLabels }: { integrity?: TestIntegrity; startedAt?: number; questionLabels?: Record<string, string> }) {
  if (!integrity) return null;
  const count = countIntegrityIncidents(integrity.events);
  return <section className="integrity-summary"><div><ShieldCheck size={18} /><h3>Session integrity record</h3><span>{integrity.policy.mode === 'guarded' ? 'Guarded' : 'Practice'}</span></div><p>{integrity.policy.mode === 'practice' ? 'Browser monitoring was off for this attempt.' : `${count} distinct focus/fullscreen incident${count === 1 ? '' : 's'} recorded. ${integrity.policy.autoSubmitAfter === null ? 'Automatic submission was disabled.' : `The selected automatic submission limit was ${integrity.policy.autoSubmitAfter}.`}`}</p>{integrity.policy.mode === 'guarded' && <p className="integrity-privacy">Browser observations can have innocent causes. Event times show when observations were recorded or acknowledged. This record does not verify identity or prove misconduct.</p>}<details><summary>View recorded events ({integrity.events.length})</summary>{integrity.events.length ? <ol className="integrity-event-log">{integrity.events.map(event => { const seconds = startedAt === undefined ? null : Math.max(0, Math.floor((event.at - startedAt) / 1000)); return <li key={event.id}><time dateTime={new Date(event.at).toISOString()}>{seconds === null ? new Date(event.at).toLocaleTimeString('en-IN') : `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`}</time><span>{integrityEventLabel(event)}{event.questionId && questionLabels?.[event.questionId] && <small>{questionLabels[event.questionId]}</small>}</span></li>; })}</ol> : <p className="integrity-no-events">No browser integrity events were recorded.</p>}</details></section>;
}
