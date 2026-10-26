import { describe, expect, it, vi } from 'vitest';
import { getCbtImportReadiness, keyBlocksFor } from './CbtImport';
import { mergeCbtAnswerKey, parseCbtAnswerKey } from './cbt-answer-key';
import type { CbtDraftQuestion } from './cbt-import';

// Review guards are pure. Motion/rendering does not need a browser in these tests.
vi.mock('./ui', () => ({ Markdown: () => null, Modal: () => null, duration: (value: number) => value, gsap: {}, useGSAP: () => {} }));

const question = (id: string, sourceNumber = id): CbtDraftQuestion => ({
  id, sourceNumber, prompt: 'User supplied question', subject: 'User subject', chapter: '', topic: '', difficulty: 'Moderate', kind: 'single', options: ['First supplied option', 'Second supplied option'], sourceOptionLabels: ['A', 'B'], correctAnswers: [0], marks: 4, negativeMarks: 1, idealSeconds: 60, explanation: '',
});
const signature = (source: string, mode: 'fill' | 'replace' = 'fill') => JSON.stringify([source, 'text', mode]);
const readiness = (questions: CbtDraftQuestion[], overrides: Partial<Parameters<typeof getCbtImportReadiness>[0]> = {}) => getCbtImportReadiness({
  questions, keyBlocks: {}, keySource: '', keyFormat: 'text', keyMode: 'fill', appliedKey: '', keyReading: false, reviewed: true, title: 'User paper', minutes: 60, ...overrides,
});

describe('separate-key review safeguards', () => {
  it('blocks creating a previously reviewed draft while a changed key is pending', () => {
    const draft = [question('1')];
    expect(readiness(draft, { keySource: '1: A', appliedKey: signature('1: A') }).canSave).toBe(true);
    const edited = readiness(draft, { keySource: '1: B', appliedKey: signature('1: A') });
    expect(edited.keyPending).toBe(true);
    expect(edited.canReview).toBe(false);
    expect(edited.canSave).toBe(false);
    expect(readiness(draft, { keySource: '1: A', keyMode: 'replace', appliedKey: signature('1: A') }).canSave).toBe(false);
  });

  it('retains a conflicting answer but blocks final review until explicitly resolved', () => {
    const draft = [question('1')], source = '1: B';
    const result = mergeCbtAnswerKey(draft, parseCbtAnswerKey(source, 'text'), 'fill');
    const blocks = keyBlocksFor(result.questions, result);
    expect(result.questions[0].correctAnswers).toEqual([0]);
    expect(readiness(result.questions, { keyBlocks: blocks, keySource: source, appliedKey: signature(source) })).toMatchObject({ incomplete: 1, keyPending: false, canReview: false, canSave: false });
  });

  it('keeps unresolved conflicts when a later key omits that question or is removed', () => {
    const draft = [question('1'), question('2')];
    const conflict = mergeCbtAnswerKey(draft, parseCbtAnswerKey('1: B', 'text'), 'fill');
    const firstBlocks = keyBlocksFor(draft, conflict);
    const later = mergeCbtAnswerKey(draft, parseCbtAnswerKey('2: A', 'text'), 'fill');
    const preserved = keyBlocksFor(later.questions, later, firstBlocks);
    expect(preserved).toHaveProperty('1');
    expect(readiness(later.questions, { keyBlocks: preserved, keySource: '' }).canSave).toBe(false);
  });

  it('clears the matching blocker after a valid explicit replacement and requires review again', () => {
    const draft = [question('1')], source = '1: B';
    const conflict = mergeCbtAnswerKey(draft, parseCbtAnswerKey(source, 'text'), 'fill');
    const blocks = keyBlocksFor(draft, conflict);
    const replaced = mergeCbtAnswerKey(draft, parseCbtAnswerKey(source, 'text'), 'replace');
    const resolved = keyBlocksFor(replaced.questions, replaced, blocks);
    expect(replaced.questions[0].correctAnswers).toEqual([1]);
    expect(resolved).toEqual({});
    const state = { keyBlocks: resolved, keySource: source, keyMode: 'replace' as const, appliedKey: signature(source, 'replace') };
    expect(readiness(replaced.questions, { ...state, reviewed: false })).toMatchObject({ canReview: true, canSave: false });
    expect(readiness(replaced.questions, state).canSave).toBe(true);
  });

  it('blocks every duplicate source number instead of guessing a question by position', () => {
    const draft = [question('first', '1'), question('second', '01')];
    const result = mergeCbtAnswerKey(draft, parseCbtAnswerKey('1: B', 'text'), 'replace');
    const blocks = keyBlocksFor(draft, result);
    expect(Object.keys(blocks).sort()).toEqual(['first', 'second']);
    expect(result.questions.map(item => item.correctAnswers)).toEqual([[0], [0]]);
    expect(readiness(draft, { keyBlocks: blocks }).incomplete).toBe(2);
  });

  it('preserves missing-answer flags and blocks final review while key extraction is running', () => {
    const missing = { ...question('1'), correctAnswers: [] };
    expect(readiness([missing]).canReview).toBe(false);
    expect(readiness([question('1')], { keyReading: true })).toMatchObject({ canReview: false, canSave: false });
    expect(readiness([question('1')], { keySource: '   ' }).canSave).toBe(true);
  });

  it('does not associate an unrecognized source number with unnumbered manual questions', () => {
    const draft = [question('manual', 'Manual')];
    const blocks = keyBlocksFor(draft, { questions: draft, rows: [{ sourceNumber: '?', answerLabel: 'A', status: 'invalid', message: 'No valid source number.' }], applied: 0, warnings: [] });
    expect(blocks).toEqual({});
  });
});
