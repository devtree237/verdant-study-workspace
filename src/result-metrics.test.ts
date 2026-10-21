import { describe, expect, it } from 'vitest';
import { getDifficultyGroups, getErrorOptimization, getTimeJourney, getTimeQuality } from './result-metrics';
import { createAttempt, scoreQuestion, type QuestionAnalysis, type TestQuestion, type TestResponse } from './testing-model';

// Test-only authored examples are never imported into the live workspace.
const question = (id: string, overrides: Partial<TestQuestion> = {}): TestQuestion => ({
  id, prompt: 'Choose an answer', subject: 'Physics', chapter: '', topic: '', difficulty: 'Easy', kind: 'single',
  options: ['A', 'B'], correctAnswers: [1], marks: 4, negativeMarks: 1, idealSeconds: 120, explanation: '', ...overrides,
});
const response = (value: number[] = [], seconds = 0, visited = true): TestResponse => ({
  value, seconds, visited, visits: visited ? 1 : 0, changes: 0, markedReview: false,
});
const row = (q: TestQuestion, value: number[] = [], seconds = 0, visited = true) => scoreQuestion(q, response(value, seconds, visited));

describe('final-answer time journey', () => {
  it('uses only the final recorded answer for each answered question, with partial intervals and inclusive final boundary', () => {
    const questions = Array.from({ length: 6 }, (_, index) => question(`q${index + 1}`));
    const attempt = createAttempt({ id: 'paper', title: 'Timed paper', description: '', durationMinutes: 65, questions, createdAt: 1, updatedAt: 1 }, 1000);
    const at = (seconds: number) => attempt.startedAt + seconds * 1000;
    attempt.events = [
      ...attempt.events,
      { type: 'answer', questionId: 'q1', at: at(300), value: [1] },
      { type: 'answer', questionId: 'q2', at: at(1800), value: [0] },
      { type: 'answer', questionId: 'q3', at: at(2000), value: [0] },
      { type: 'answer', questionId: 'q3', at: at(3600), value: [1] },
      { type: 'answer', questionId: 'q4', at: at(3700), value: [1] },
      { type: 'clear', questionId: 'q4', at: at(3800), value: [] },
      { type: 'answer', questionId: 'q6', at: at(3900), value: [1] },
    ];
    const rows = questions.map((q, index) => row(q, index === 1 ? [0] : index === 3 ? [] : [1], 10));
    const bins = getTimeJourney(attempt, rows);
    expect(bins).toEqual([
      { label: '0–30 min', fromSeconds: 0, toSeconds: 1800, correct: 1, incorrect: 0, total: 1 },
      { label: '30–60 min', fromSeconds: 1800, toSeconds: 3600, correct: 0, incorrect: 1, total: 1 },
      { label: '60–65 min', fromSeconds: 3600, toSeconds: 3900, correct: 2, incorrect: 0, total: 2 },
    ]);
    // q4 was cleared, q5 has no recorded answer time, and q3's earlier answer is superseded.
    expect(bins.reduce((sum, bin) => sum + bin.total, 0)).toBe(4);
  });
  it('excludes invalid or missing timestamps rather than synthesizing them from question time', () => {
    const q = question('q');
    const attempt = createAttempt({ id: 'paper', title: 'A paper', description: '', durationMinutes: 30, questions: [q], createdAt: 1, updatedAt: 1 }, 1000);
    const rows = [row(q, [1], 100)];
    expect(getTimeJourney(attempt, rows)[0].total).toBe(0);
    for (const at of [0, attempt.deadlineAt + 1, NaN]) {
      const withInvalidEvent = { ...attempt, events: [...attempt.events, { type: 'answer' as const, at, questionId: q.id, value: [1] }] };
      expect(getTimeJourney(withInvalidEvent, rows)[0].total).toBe(0);
    }
    expect(() => getTimeJourney(attempt, rows, 0)).toThrow('positive');
    expect(() => getTimeJourney(attempt, rows, Infinity)).toThrow('positive');
    expect(getTimeJourney(attempt, rows, 15)).toHaveLength(2);
    expect(getTimeJourney(attempt, rows, Number.MAX_VALUE)).toHaveLength(1);
  });
  it('includes a fractional-duration deadline without losing the answer to floating-point conversion', () => {
    const q = question('fractional');
    const attempt = createAttempt({ id: 'fractional', title: 'Fractional duration', description: '', durationMinutes: 1.17, questions: [q], createdAt: 1, updatedAt: 1 }, 1000);
    attempt.events.push({ type: 'answer', questionId: q.id, value: [1], at: attempt.deadlineAt });
    expect(getTimeJourney(attempt, [row(q, [1], 70.2)])[0].total).toBe(1);
  });
});

describe('quality of measured time', () => {
  it('combines skipped and unvisited time without double counting and handles zero time', () => {
    const rows = [row(question('correct'), [1], 15), row(question('wrong'), [0], 30), row(question('skip'), [], 15), row(question('unvisited'), [], 0, false)];
    expect(getTimeQuality(rows)).toEqual({ totalSeconds: 60, correctSeconds: 15, incorrectSeconds: 30, unansweredSeconds: 15, correctPercent: 25, incorrectPercent: 50, unansweredPercent: 25 });
    expect(getTimeQuality([])).toEqual({ totalSeconds: 0, correctSeconds: 0, incorrectSeconds: 0, unansweredSeconds: 0, correctPercent: 0, incorrectPercent: 0, unansweredPercent: 0 });
    expect(getTimeQuality([row(question('zero'), [1], 0)]).correctPercent).toBe(0);
  });
  it('keeps fractional seconds and proportional percentages', () => {
    const quality = getTimeQuality([row(question('correct'), [1], .1), row(question('wrong'), [0], .2)]);
    expect(quality.totalSeconds).toBe(.3);
    expect(quality.correctPercent).toBeCloseTo(100 / 3, 5);
    expect(quality.incorrectPercent).toBeCloseTo(200 / 3, 5);
  });
});

describe('incorrect-answer lost-mark optimization', () => {
  it('recovers a hypothetical share of incorrect-answer lost marks while leaving skipped questions unchanged', () => {
    const rows = [row(question('right', { marks: 5 }), [1]), row(question('wrong', { marks: 10, negativeMarks: 1.5 }), [0]), row(question('skipped', { marks: 2 }), [])];
    expect(getErrorOptimization(rows)).toEqual({ actualScore: 3.5, maxScore: 17, negativeMarks: 1.5, scenarios: [
      { label: 'Actual score', reduction: 0, actualScore: 3.5, improvement: 0, score: 3.5 },
      { label: '50% less error', reduction: .5, actualScore: 3.5, improvement: 5.75, score: 9.25 },
      { label: '100% less error', reduction: 1, actualScore: 3.5, improvement: 11.5, score: 15 },
    ] });
  });
  it('handles a negative starting score, zero penalties and an empty result set', () => {
    const negative = getErrorOptimization([row(question('one', { negativeMarks: 2 }), [0]), row(question('two', { negativeMarks: .5 }), [0])]);
    expect(negative.scenarios.map(scenario => scenario.score)).toEqual([-2.5, 2.75, 8]);
    expect(negative.scenarios[2].score).toBe(negative.maxScore);
    const noPenalty = getErrorOptimization([row(question('no-penalty', { negativeMarks: 0 }), [0])]);
    expect(noPenalty.negativeMarks).toBe(0);
    expect(noPenalty.scenarios.map(scenario => scenario.improvement)).toEqual([0, 2, 4]);
    expect(getErrorOptimization([])).toMatchObject({ actualScore: 0, maxScore: 0, negativeMarks: 0 });
  });
});

describe('difficulty groups from filtered rows', () => {
  it('keeps unvisited a subset of unanswered and reconciles marking, timing and answer totals', () => {
    const rows: QuestionAnalysis[] = [
      row(question('a'), [1], 10), row(question('b'), [0], 20), row(question('c'), [], 5), row(question('d'), [], 0, false),
      row(question('e', { difficulty: 'Tough', subject: 'Chemistry', marks: 6 }), [1], 30),
    ];
    const groups = getDifficultyGroups(rows);
    expect(groups.map(group => group.name)).toEqual(['Easy', 'Moderate', 'Tough']);
    expect(groups[0]).toEqual({ name: 'Easy', score: 3, maxScore: 16, positiveScore: 4, negativeScore: 1, attempted: 2, correct: 1, incorrect: 1, unattempted: 2, notVisited: 1, total: 4, timeSeconds: 35, accuracy: 50 });
    const filtered = getDifficultyGroups(rows.filter(item => item.question.subject === 'Chemistry'));
    expect(filtered[0]).toMatchObject({ total: 0, accuracy: 0, score: 0, notVisited: 0 });
    expect(filtered[2]).toMatchObject({ total: 1, correct: 1, accuracy: 100, score: 6, timeSeconds: 30 });
    expect(groups.reduce((sum, group) => sum + group.total, 0)).toBe(rows.length);
  });
});
