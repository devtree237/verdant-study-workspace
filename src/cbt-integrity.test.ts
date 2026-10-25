import { describe, expect, it } from 'vitest';
import { appendIntegrityEvent, countIntegrityIncidents, createTestIntegrity, DEFAULT_INTEGRITY_POLICY, GUARDED_INTEGRITY_POLICY, integrityEventLabel, shouldAutoSubmit, validateIntegrityEvent, validateIntegrityPolicy, validateTestIntegrity } from './cbt-integrity';
import type { IntegrityEvent } from './cbt-integrity';

const event = (id: string, at: number, kind: IntegrityEvent['kind'] = 'focus-loss', detail: IntegrityEvent['detail'] = 'hidden'): IntegrityEvent => ({ id, at, kind, detail, questionId: 'authored-question' });

describe('transparent, opt-in integrity policy', () => {
  it('defaults to unmonitored practice with no automatic submission', () => {
    expect(validateIntegrityPolicy(undefined)).toEqual(DEFAULT_INTEGRITY_POLICY);
    expect(shouldAutoSubmit(createTestIntegrity())).toBe(false);
    expect(GUARDED_INTEGRITY_POLICY.autoSubmitAfter).toBeNull();
    expect(GUARDED_INTEGRITY_POLICY.restrictClipboard).toBe(false);
  });

  it('practice keeps shuffling but turns off monitoring and enforced submission', () => {
    const policy = validateIntegrityPolicy({ ...GUARDED_INTEGRITY_POLICY, mode: 'practice', restrictClipboard: true, restrictContextMenu: true, shuffleQuestions: true, shuffleOptions: true, autoSubmitAfter: 3 });
    expect(policy).toMatchObject({ mode: 'practice', requireFullscreen: false, trackFocus: false, restrictClipboard: false, restrictContextMenu: false, shuffleQuestions: true, shuffleOptions: true, autoSubmitAfter: null });
  });

  it('rejects invalid thresholds and non-boolean policy values', () => {
    expect(() => validateIntegrityPolicy({ ...GUARDED_INTEGRITY_POLICY, autoSubmitAfter: 0 })).toThrow('1–50');
    expect(() => validateIntegrityPolicy({ ...GUARDED_INTEGRITY_POLICY, autoSubmitAfter: 1.5 })).toThrow('1–50');
    expect(() => validateIntegrityPolicy({ ...GUARDED_INTEGRITY_POLICY, trackFocus: 'yes' })).toThrow('true or false');
  });
});

describe('integrity observations and incident counting', () => {
  it('coalesces blur, hidden-page and fullscreen events in one browser burst', () => {
    let record = createTestIntegrity({ ...GUARDED_INTEGRITY_POLICY });
    record = appendIntegrityEvent(record, event('blur', 1000, 'focus-loss', 'window-blur'));
    record = appendIntegrityEvent(record, event('hidden', 1100));
    record = appendIntegrityEvent(record, event('fullscreen', 1250, 'fullscreen-exit', 'escape-or-browser'));
    record = appendIntegrityEvent(record, event('next-incident', 4000));
    expect(record.events.map(item => item.id)).toEqual(['blur', 'next-incident']);
    expect(countIntegrityIncidents(record.events)).toBe(2);
  });

  it('does not count blocked clipboard/menu/print operations as focus incidents', () => {
    const events = [event('copy', 1000, 'clipboard-blocked', 'copy'), event('menu', 2000, 'contextmenu-blocked', 'context-menu'), event('print', 3000, 'print-blocked', 'print')];
    expect(countIntegrityIncidents(events)).toBe(0);
    let record = createTestIntegrity({ ...GUARDED_INTEGRITY_POLICY, autoSubmitAfter: 1 });
    for (const item of events) record = appendIntegrityEvent(record, item);
    expect(shouldAutoSubmit(record)).toBe(false);
  });

  it('deduplicates event IDs and repeated blocked shortcuts without losing distinct operations', () => {
    const base = appendIntegrityEvent(createTestIntegrity({ ...GUARDED_INTEGRITY_POLICY }), event('copy', 1000, 'clipboard-blocked', 'copy'));
    expect(appendIntegrityEvent(base, event('copy', 1000, 'clipboard-blocked', 'copy'))).toBe(base);
    expect(appendIntegrityEvent(base, event('repeat-copy', 1100, 'clipboard-blocked', 'copy'))).toBe(base);
    expect(appendIntegrityEvent(base, event('paste', 1200, 'clipboard-blocked', 'paste')).events).toHaveLength(2);
  });

  it('requests submission only at the explicitly selected distinct-incident limit', () => {
    let record = createTestIntegrity({ ...GUARDED_INTEGRITY_POLICY, autoSubmitAfter: 2 });
    record = appendIntegrityEvent(record, event('first', 1000));
    expect(shouldAutoSubmit(record)).toBe(false);
    record = appendIntegrityEvent(record, event('same-burst', 1300, 'fullscreen-exit', 'escape-or-browser'));
    expect(shouldAutoSubmit(record)).toBe(false);
    record = appendIntegrityEvent(record, event('second', 5000));
    expect(shouldAutoSubmit(record)).toBe(true);
    record = appendIntegrityEvent(record, event('submit-marker', 5000, 'auto-submit', 'threshold'));
    record = appendIntegrityEvent(record, event('later', 9000));
    expect(shouldAutoSubmit(record)).toBe(false);
  });
});

describe('safe integrity persistence', () => {
  it('retains canonical observations without URLs, clipboard data, or typed content', () => {
    const clean = validateIntegrityEvent({ ...event('observed', 2000), url: 'https://private.invalid', clipboard: 'private answer', typedContent: 'personal text' });
    expect(clean).toEqual(event('observed', 2000));
    expect(() => validateIntegrityEvent({ ...event('bad-detail', 2000), detail: 'copied personal text' })).toThrow('detail');
  });

  it('rejects corrupt, duplicate, or out-of-order persisted events', () => {
    const base = createTestIntegrity({ ...GUARDED_INTEGRITY_POLICY });
    expect(() => validateTestIntegrity({ ...base, events: [event('later', 2000), event('earlier', 1000)] })).toThrow('timestamp order');
    expect(() => validateTestIntegrity({ ...base, events: [event('same', 1000), event('same', 2000)] })).toThrow('unique');
    expect(() => validateTestIntegrity({ ...base, events: [{ ...event('invalid', 1000), at: Infinity }] })).toThrow('timestamp');
    expect(() => validateTestIntegrity({ ...base, version: 8 })).toThrow('invalid');
  });

  it('uses observation wording instead of making misconduct claims', () => {
    expect(integrityEventLabel(event('blur', 1000, 'focus-loss', 'window-blur'))).toBe('Window focus change acknowledged');
    expect(integrityEventLabel(event('submit', 1000, 'auto-submit', 'threshold'))).toContain('requested');
  });
});
