import { describe, expect, it } from 'vitest';
import { analyseAttempt, answerQuestion, clearAnswer, compareCohort, createAttempt, paperFingerprint, parseCohortJSON, parsePaperJSON, questionStatus, scoreQuestion, setErrorCategory, submitAttempt, tickAttempt, toggleReview, validateAttempt, validatePaper, visitQuestion, type TestPaper, type TestQuestion, type TestResponse } from './testing-model';

// Deliberately tiny test fixtures; nothing in this file is imported by the app.
const question = (overrides: Partial<TestQuestion> = {}): TestQuestion => ({
  id: 'one', prompt: 'Select an option', subject: 'Physics', chapter: 'Motion', topic: 'Speed', difficulty: 'Easy',
  kind: 'single', options: ['First', 'Second', 'Third'], correctAnswers: [1], marks: 4, negativeMarks: 1,
  idealSeconds: 30, explanation: 'The second option is correct.', ...overrides,
});
const paper = (questions = [question()]): TestPaper => ({ id: 'paper', title: 'An authored test', description: '', durationMinutes: 2, questions, createdAt: 1000, updatedAt: 1000 });
const response = (value: number[] | string, overrides: Partial<TestResponse> = {}): TestResponse => ({ value, markedReview: false, visited: true, visits: 1, seconds: 10, changes: 0, ...overrides });

describe('test scoring', () => {
  it('awards positive marks and applies the authored negative marking only to wrong answers', () => {
    expect(scoreQuestion(question(), response([1]))).toMatchObject({ status: 'correct', score: 4, positiveScore: 4, negativeScore: 0, marksLost: 0 });
    expect(scoreQuestion(question({ negativeMarks: 1.25 }), response([2]))).toMatchObject({ status: 'incorrect', score: -1.25, negativeScore: 1.25, marksLost: 5.25 });
    expect(scoreQuestion(question())).toMatchObject({ status: 'unvisited', score: 0, attempted: false, correct: null });
  });
  it('requires the exact set of answers for multiple-select questions', () => {
    const q = question({ kind: 'multiple', correctAnswers: [0, 2] });
    expect(scoreQuestion(q, response([2, 0])).correct).toBe(true);
    expect(scoreQuestion(q, response([0])).score).toBe(-1);
    expect(scoreQuestion(q, response([0, 1, 2])).correct).toBe(false);
  });
  it('handles zero, negative numeric values and decimal tolerance boundaries without rounding the answer', () => {
    const q = question({ kind: 'numeric', options: [], correctAnswers: [], numericAnswer: 0.3, tolerance: 0.1 });
    expect(scoreQuestion(q, response('0.4')).correct).toBe(true);
    expect(scoreQuestion(q, response('0.40001')).correct).toBe(false);
    expect(scoreQuestion({ ...q, numericAnswer: 0, tolerance: 0 }, response('0')).correct).toBe(true);
    expect(scoreQuestion({ ...q, numericAnswer: -3.5, tolerance: 0 }, response('-3.5')).correct).toBe(true);
    expect(scoreQuestion(q, response('')).attempted).toBe(false);
  });
  it('explains time-quality categories using answer correctness and target time', () => {
    expect(scoreQuestion(question(), response([1], { seconds: 30 })).timeCategory).toBe('Perfect');
    expect(scoreQuestion(question(), response([1], { seconds: 31 })).timeCategory).toBe('Overtime');
    expect(scoreQuestion(question(), response([0], { seconds: 31 })).timeCategory).toBe('Overtime');
    expect(scoreQuestion(question(), response([0], { seconds: 14 })).timeCategory).toBe('Wasted');
    expect(scoreQuestion(question(), response([0], { seconds: 15 })).timeCategory).toBe('Other');
    expect(scoreQuestion(question(), response([0], { seconds: 20 })).timeCategory).toBe('Other');
    expect(scoreQuestion(question(), response([], { seconds: 31 })).timeCategory).toBe('Confused');
  });
});

describe('resumable attempts and deadlines', () => {
  it('freezes a distinct paper snapshot so later paper edits cannot change a result', () => {
    const original = paper(), attempt = createAttempt(original, 1000);
    original.questions[0].marks = 100;
    original.questions[0].options[1] = 'Edited';
    expect(attempt.paper.questions[0].marks).toBe(4);
    expect(attempt.paper.questions[0].options[1]).toBe('Second');
    expect(Object.isFrozen(attempt.paper.questions[0].correctAnswers)).toBe(true);
  });
  it('caps elapsed time at the absolute deadline and rejects answers at or after expiry', () => {
    const attempt = createAttempt(paper(), 1000);
    const ended = answerQuestion(attempt, 'one', [1], 121000);
    expect(ended).toMatchObject({ status: 'submitted', submissionReason: 'expired', submittedAt: 121000, lastTickAt: 121000 });
    expect(ended.responses.one.value).toEqual([]);
    expect(ended.responses.one.seconds).toBe(120);
    expect(tickAttempt(ended, 500000)).toBe(ended);
    expect(submitAttempt(ended, 500000)).toBe(ended);
  });
  it('attributes elapsed time to the current question across navigation and reloads', () => {
    let attempt = createAttempt(paper([question(), question({ id: 'two', subject: 'Chemistry' })]), 1000);
    attempt = answerQuestion(attempt, 'one', [1], 11000);
    attempt = visitQuestion(attempt, 'two', 21000);
    attempt = validateAttempt(JSON.parse(JSON.stringify(attempt)));
    attempt = tickAttempt(attempt, 51000);
    attempt = visitQuestion(attempt, 'one', 61000);
    attempt = submitAttempt(attempt, 71000);
    expect(attempt.responses.one.seconds).toBe(30);
    expect(attempt.responses.two.seconds).toBe(40);
    expect(attempt.responses.one.visits).toBe(2);
    expect(analyseAttempt(attempt).timeSeconds).toBe(70);
    expect(analyseAttempt(attempt).subjectMovement.map(row => row.subject)).toEqual(['Physics', 'Chemistry', 'Physics']);
    expect(validateAttempt(JSON.parse(JSON.stringify(attempt))).submittedAt).toBe(71000);
  });
  it('does not duplicate time on backward wall-clock updates and expires a dormant restored attempt', () => {
    let attempt = tickAttempt(createAttempt(paper(), 1000), 21000);
    attempt = tickAttempt(attempt, 11000);
    expect(attempt.responses.one.seconds).toBe(20);
    const restored = validateAttempt(JSON.parse(JSON.stringify(attempt)));
    const ended = tickAttempt(restored, 999000);
    expect(ended.responses.one.seconds).toBe(120);
    expect(ended.events.filter(event => event.type === 'submit')).toHaveLength(1);
  });
  it('tracks first answers, actual answer revisions, review markers and clearing separately', () => {
    let attempt = createAttempt(paper(), 1000);
    expect(questionStatus(attempt.paper.questions[0], attempt.responses.one)).toBe('unanswered');
    attempt = answerQuestion(attempt, 'one', [1], 2000);
    expect(attempt.responses.one.changes).toBe(0);
    attempt = toggleReview(attempt, 'one', 3000);
    expect(questionStatus(attempt.paper.questions[0], attempt.responses.one)).toBe('answered-review');
    attempt = answerQuestion(attempt, 'one', [0], 4000);
    attempt = clearAnswer(attempt, 'one', 5000);
    expect(attempt.responses.one.changes).toBe(2);
    expect(questionStatus(attempt.paper.questions[0], attempt.responses.one)).toBe('review');
    expect(() => answerQuestion(attempt, 'one', [5], 6000)).toThrow('Selected option');
    expect(() => visitQuestion(attempt, 'missing', 6000)).toThrow('does not belong');
  });
});

describe('analysis from measured activity', () => {
  it('reconciles subject totals, penalties, skipped questions and achievable score scenarios', () => {
    let attempt = createAttempt(paper([
      question(), question({ id: 'two', subject: 'Chemistry', difficulty: 'Tough' }),
      question({ id: 'three', subject: 'Chemistry' }), question({ id: 'four', subject: 'Mathematics' }),
    ]), 1000);
    attempt = answerQuestion(attempt, 'one', [1], 11000);
    attempt = visitQuestion(attempt, 'two', 21000);
    attempt = answerQuestion(attempt, 'two', [0], 61000);
    attempt = visitQuestion(attempt, 'three', 71000);
    attempt = submitAttempt(attempt, 81000);
    const analysis = analyseAttempt(attempt);
    expect(analysis).toMatchObject({ score: 3, maxScore: 16, positiveScore: 4, negativeScore: 1, attempted: 2, correct: 1, incorrect: 1, unattempted: 2, notVisited: 1, timeSeconds: 80, accuracy: 50, completionPercent: 50 });
    expect(analysis.improvement).toEqual({ recoverableMarks: 13, scoreWithoutNegative: 4, scoreIfIncorrectCorrect: 8, scoreIfAllCorrect: 16 });
    expect(analysis.subjects.reduce((sum, subject) => sum + subject.score, 0)).toBe(analysis.score);
    expect(analysis.timeBuckets.reduce((sum, bucket) => sum + bucket.seconds, 0)).toBe(80);
    expect(analysis.efficiency.reduce((sum, bucket) => sum + bucket.questions, 0)).toBe(4);
    expect(analysis.painfulQuestions[0].question.id).toBe('two');
    const diagnosed = analyseAttempt(setErrorCategory(attempt, 'two', 'Calculation error'));
    expect(diagnosed.errors).toContainEqual({ label: 'Calculation error', questions: 1, lostMarks: 5 });
    expect(diagnosed.score).toBe(3);
  });
});

describe('untrusted import and persistence validation', () => {
  it('fingerprints the actual test revision independently of timestamps, labels and object key order', () => {
    const original = paper([question(), question({ id: 'two' })]);
    const fingerprint = paperFingerprint(original);
    expect(fingerprint).toMatch(/^vp1-[0-9a-f]{16}$/);
    expect(paperFingerprint({ ...original, title: 'Renamed test', description: 'Updated instructions', createdAt: 8888, updatedAt: 9999 })).toBe(fingerprint);
    expect(paperFingerprint(JSON.parse(JSON.stringify(original)))).toBe(fingerprint);
    expect(paperFingerprint({ ...original, durationMinutes: 3 })).not.toBe(fingerprint);
    expect(paperFingerprint({ ...original, questions: original.questions.map((q, i) => i ? q : { ...q, marks: 5 }) })).not.toBe(fingerprint);
    expect(paperFingerprint({ ...original, questions: original.questions.map((q, i) => i ? q : { ...q, correctAnswers: [0] }) })).not.toBe(fingerprint);
    expect(paperFingerprint({ ...original, questions: [...original.questions].reverse() })).not.toBe(fingerprint);
    const reordered = Object.fromEntries(Object.entries(original.questions[0]).reverse()) as TestQuestion;
    expect(paperFingerprint({ ...original, questions: [reordered, original.questions[1]] })).toBe(fingerprint);
  });
  it('accepts complete authored paper JSON and rejects invalid answer keys, limits and duplicate IDs', () => {
    expect(parsePaperJSON(JSON.stringify(paper())).questions[0].correctAnswers).toEqual([1]);
    expect(() => parsePaperJSON('{oops')).toThrow('valid JSON');
    expect(() => validatePaper(paper([question({ correctAnswers: [9] })]))).toThrow('answer index');
    expect(() => validatePaper(paper([question(), question()]))).toThrow('duplicate question ID');
    expect(() => validatePaper({ ...paper(), durationMinutes: Infinity })).toThrow('Duration');
    expect(() => validatePaper(paper(Array.from({ length: 1001 }, (_, i) => question({ id: String(i) }))))).toThrow('1,000');
    expect(() => validatePaper(paper([question({ kind: 'numeric', numericAnswer: NaN })]))).toThrow('numeric answer');
  });
  it('rejects corrupted saved timing and impossible submitted state', () => {
    const attempt = tickAttempt(createAttempt(paper(), 1000), 11000);
    expect(() => validateAttempt({ ...attempt, responses: { one: { ...attempt.responses.one, seconds: 99 } } })).toThrow('elapsed attempt time');
    expect(() => validateAttempt({ ...attempt, deadlineAt: 999999 })).toThrow('duration');
    expect(() => validateAttempt({ ...attempt, status: 'submitted', submittedAt: 11000, submissionReason: 'manual' })).toThrow('final submission event');
  });
});

describe('real imported cohort comparisons', () => {
  it('uses competition ranks and empirical midrank percentile for ties without inventing a cohort', () => {
    const analysis = analyseAttempt(submitAttempt(answerQuestion(createAttempt(paper(), 1000), 'one', [1], 2000), 3000));
    const cohort = parseCohortJSON(JSON.stringify([
      { name: 'Imported A', score: 5, timeSeconds: 30, attempted: 1, correct: 1 },
      { name: 'Imported B', score: 4, timeSeconds: 40, attempted: 1, correct: 1 },
      { name: 'Imported C', score: 4, timeSeconds: 50, attempted: 1, correct: 1 },
      { name: 'Imported D', score: 0, timeSeconds: 60, attempted: 0, correct: 0 },
    ]));
    expect(compareCohort(analysis, cohort)).toMatchObject({ count: 4, rank: 2, percentile: 50, averageScore: 3.25, topScore: 5, averageTimeSeconds: 45 });
    expect(compareCohort(analysis, cohort).scoreDistribution.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(4);
    expect(compareCohort(analysis, [])).toMatchObject({ count: 0, rank: null, percentile: null, averageScore: null, scoreDistribution: [] });
  });
  it('retains optional real subject/question results and rejects inconsistent or malformed rows', () => {
    const record = { name: 'Imported participant', paperId: 'paper', paperFingerprint: paperFingerprint(paper()), score: 4, timeSeconds: 30, attempted: 1, correct: 1,
      subjectScores: { Physics: 4 }, questionResults: [{ questionId: 'one', status: 'correct', timeSeconds: 30, answeredAtSeconds: 20 }] };
    expect(parseCohortJSON(JSON.stringify([record]))[0]).toEqual(record);
    expect(() => parseCohortJSON(JSON.stringify([{ ...record, correct: 2 }]))).toThrow('Correct count');
    expect(() => parseCohortJSON(JSON.stringify([{ ...record, timeSeconds: -1 }]))).toThrow('Time in seconds');
    expect(() => parseCohortJSON(JSON.stringify([{ ...record, questionResults: [{ questionId: 'one', status: 'guessed', timeSeconds: 20 }] }]))).toThrow('question status');
    expect(() => parseCohortJSON(JSON.stringify([{ ...record, questionResults: [...record.questionResults, ...record.questionResults] }]))).toThrow('duplicate question result');
    expect(() => parseCohortJSON(JSON.stringify([{ ...record, paperFingerprint: 'unknown-revision' }]))).toThrow('fingerprint');
  });
});
