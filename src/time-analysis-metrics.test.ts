import { describe, expect, it } from 'vitest';
import { answerTimestampCoverage, getHourlyComparison, getTimeComparisonRows, getTimePeerGroups } from './time-analysis-metrics';
import { analyseAttempt, createAttempt, paperFingerprint } from './testing-model';
import type { CohortRecord, TestAttempt, TestPaper, TestQuestion, TestResponse } from './testing-model';

// Test-only authored records; none are imported by the application.
const question = (id: string, subject: string): TestQuestion => ({ id, subject, prompt: 'Supplied question', chapter: '', topic: '', difficulty: 'Moderate', kind: 'single', options: ['A', 'B'], correctAnswers: [0], marks: 4, negativeMarks: 1, idealSeconds: 120, explanation: '' });
const response = (value: number[], seconds: number): TestResponse => ({ value, seconds, markedReview: false, visited: true, visits: 1, changes: 0 });
const fixture = () => {
  const paper: TestPaper = { id: 'paper', title: 'Supplied test', description: '', durationMinutes: 125, questions: [question('q1', 'Physics'), question('q2', 'Physics'), question('q3', 'Chemistry'), question('q4', 'Chemistry')], createdAt: 1, updatedAt: 1 };
  const attempt = createAttempt(paper, 1000);
  attempt.responses = { q1: response([0], 120), q2: response([1], 60), q3: response([0], 240), q4: response([], 30) };
  attempt.events = [{ type: 'start', at: attempt.startedAt }, { type: 'answer', questionId: 'q1', at: attempt.startedAt, value: [0] }, { type: 'answer', questionId: 'q2', at: attempt.startedAt + 3600_000, value: [1] }, { type: 'answer', questionId: 'q3', at: attempt.deadlineAt, value: [0] }];
  return { attempt, analysis: analyseAttempt(attempt) };
};
const peer = (attempt: TestAttempt, patch: Partial<CohortRecord> = {}): CohortRecord => ({ name: 'Actual imported result', score: 7, timeSeconds: 450, attempted: 3, correct: 2, paperId: attempt.paper.id, paperFingerprint: paperFingerprint(attempt.paper), questionResults: [{ questionId: 'q1', status: 'correct', timeSeconds: 120, answeredAtSeconds: 0 }, { questionId: 'q2', status: 'incorrect', timeSeconds: 60, answeredAtSeconds: 3600 }, { questionId: 'q3', status: 'correct', timeSeconds: 240, answeredAtSeconds: 7500 }, { questionId: 'q4', status: 'unattempted', timeSeconds: 30 }], ...patch });

describe('measured Time Breakdown comparison', () => {
  it('keeps the full-cohort score ranking stable and includes ties at top-group boundaries', () => {
    const records = [80, 95, 90, 98, 97, 96, 98, 70, 60, 50].map((score, index) => ({ name: String(index), score, timeSeconds: 1, attempted: 1, correct: 1 })), original = [...records];
    const groups = getTimePeerGroups(records);
    expect(groups[0].records.map(record => record.score)).toEqual([98, 98]);
    expect(groups[1].records.map(record => record.score)).toEqual([98, 98]);
    expect(groups[2].records.map(record => record.score)).toEqual([98, 98, 97]);
    expect(records).toEqual(original); expect(getTimePeerGroups([])).toEqual([]);
  });
  it('calculates your exact time, attempted share and accuracy without creating peer rows', () => {
    const { attempt, analysis } = fixture(), rows = getTimeComparisonRows(attempt, analysis, [], null);
    expect(rows).toEqual([{ key: 'you', label: 'You', members: 1, included: 1, timeSeconds: 450, attemptPercent: 75, accuracyPercent: 66.666667 }]);
    expect(getTimeComparisonRows(attempt, analysis, [], 'Physics')[0]).toMatchObject({ timeSeconds: 180, attemptPercent: 100, accuracyPercent: 50 });
  });
  it('uses summary-only peers overall but leaves subject metrics unavailable instead of guessing', () => {
    const { attempt, analysis } = fixture(), summary = peer(attempt, { questionResults: undefined });
    expect(getTimeComparisonRows(attempt, analysis, [summary], null)[1]).toMatchObject({ included: 1, timeSeconds: 450, attemptPercent: 75 });
    expect(getTimeComparisonRows(attempt, analysis, [summary], 'Physics')[1]).toMatchObject({ members: 1, included: 0, timeSeconds: null, attemptPercent: null, accuracyPercent: null });
  });
  it('excludes missing subject detail from the chosen rank group instead of promoting lower scorers', () => {
    const { attempt, analysis } = fixture(), first = peer(attempt, { score: 16, questionResults: undefined }), lower = peer(attempt);
    const rows = getTimeComparisonRows(attempt, analysis, [first, lower], 'Physics');
    expect(rows.find(row => row.key === 'topper')).toMatchObject({ members: 1, included: 0, timeSeconds: null });
    expect(rows.find(row => row.key === 'top10')).toMatchObject({ members: 1, included: 0 });
    expect(getTimeComparisonRows(attempt, analysis, [lower], 'Chemistry')[1]).toMatchObject({ timeSeconds: 270, attemptPercent: 50, accuracyPercent: 100 });
  });
  it('rejects foreign revisions, missing question IDs and duplicate detail rows', () => {
    const { attempt, analysis } = fixture();
    expect(getTimeComparisonRows(attempt, analysis, [peer(attempt, { paperId: 'different' }), peer(attempt, { paperFingerprint: 'different' })], null)).toHaveLength(1);
    const duplicate = peer(attempt); duplicate.questionResults![3] = { ...duplicate.questionResults![0] };
    expect(getTimeComparisonRows(attempt, analysis, [duplicate], 'Physics')[1].timeSeconds).toBeNull();
    const unknown = peer(attempt); unknown.questionResults![3].questionId = 'other';
    expect(getTimeComparisonRows(attempt, analysis, [unknown], 'Physics')[1].included).toBe(0);
  });
});

describe('recorded hourly answer distributions', () => {
  it('places start/interior/final-boundary answers correctly, including the partial final hour', () => {
    const { attempt, analysis } = fixture(), result = getHourlyComparison(attempt, analysis, [peer(attempt)], 'total');
    expect(result.bins.map(bin => bin.label)).toEqual(['0–60 min', '60–120 min', '120–125 min']);
    expect(result.rows[0].counts).toEqual([1, 1, 1]); expect(result.rows[1].counts).toEqual([1, 1, 1]);
    expect(getHourlyComparison(attempt, analysis, [], 'correct').rows[0].counts).toEqual([1, 0, 1]);
    expect(getHourlyComparison(attempt, analysis, [], 'incorrect').rows[0].counts).toEqual([0, 1, 0]);
  });
  it('makes an incomplete final-answer distribution unavailable and does not replace missing timestamps with zero', () => {
    const { attempt, analysis } = fixture(); attempt.events = attempt.events.filter(event => event.questionId !== 'q1');
    expect(answerTimestampCoverage(attempt, analysis.questionRows)).toEqual({ answered: 3, missing: 1 });
    expect(getHourlyComparison(attempt, analysis, [], 'total').rows[0]).toMatchObject({ counts: null, missingTimestamps: 1, included: 0 });
    expect(getHourlyComparison(attempt, analysis, [], 'correct').rows[0].counts).toBeNull();
    expect(getHourlyComparison(attempt, analysis, [], 'incorrect').rows[0].counts).toEqual([0, 1, 0]);
  });
  it('uses only supplied timed peers for a group mean, exposing the eligible denominator', () => {
    const { attempt, analysis } = fixture(), complete = peer(attempt), missing = peer(attempt);
    delete missing.questionResults![2].answeredAtSeconds;
    const correct = getHourlyComparison(attempt, analysis, [complete, missing], 'correct').rows.find(row => row.key === 'top10')!;
    expect(correct).toMatchObject({ members: 2, included: 1, missingTimestamps: 1, counts: [1, 0, 1] });
    const incorrect = getHourlyComparison(attempt, analysis, [complete, missing], 'incorrect').rows.find(row => row.key === 'top10')!;
    expect(incorrect).toMatchObject({ members: 2, included: 2, missingTimestamps: 0, counts: [0, 1, 0] });
  });
  it('does not infer hourly counts from summary-only or partial question detail', () => {
    const { attempt, analysis } = fixture();
    for (const record of [peer(attempt, { questionResults: undefined }), peer(attempt, { questionResults: peer(attempt).questionResults!.slice(0, 2) })]) expect(getHourlyComparison(attempt, analysis, [record], 'total').rows[1]).toMatchObject({ members: 1, included: 0, counts: null });
  });
  it('uses the final answer event once, excludes cleared answers, and keeps zero attempts as real zero counts', () => {
    const { attempt } = fixture();
    attempt.events.splice(1, 0, { type: 'answer', questionId: 'q3', at: attempt.startedAt + 20_000, value: [1] });
    attempt.responses.q2 = response([], 60);
    const analysis = analyseAttempt(attempt), counts = getHourlyComparison(attempt, analysis, [], 'total').rows[0].counts;
    expect(counts).toEqual([1, 0, 1]);
    expect(getHourlyComparison(attempt, analysis, [], 'incorrect').rows[0].counts).toEqual([0, 0, 0]);
  });
  it('does not synthesize a time from question duration for an invalid or absent event', () => {
    const { attempt, analysis } = fixture();
    for (const at of [NaN, attempt.startedAt - 1, attempt.deadlineAt + 1]) {
      const changed = { ...attempt, events: attempt.events.map(event => event.questionId === 'q1' ? { ...event, at } : event) };
      expect(getHourlyComparison(changed, analysis, [], 'correct').rows[0].counts).toBeNull();
    }
    expect(() => getHourlyComparison(attempt, analysis, [], 'total', 0)).toThrow('positive');
  });
});
