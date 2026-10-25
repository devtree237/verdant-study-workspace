import { appendIntegrityEvent, countIntegrityIncidents, createTestIntegrity, validateIntegrityEvent, validateIntegrityPolicy, validateTestIntegrity, type IntegrityEvent, type IntegrityPolicy, type TestIntegrity } from './cbt-integrity';

/** Test papers and attempts contain only questions and results supplied by the user. */
export type Difficulty = 'Easy' | 'Moderate' | 'Tough';
export type QuestionKind = 'single' | 'multiple' | 'numeric';
export type TestQuestion = {
  id: string; prompt: string; subject: string; chapter: string; topic: string;
  difficulty: Difficulty; kind: QuestionKind; options: string[]; correctAnswers: number[];
  numericAnswer?: number; tolerance?: number; marks: number; negativeMarks: number;
  idealSeconds: number; explanation: string;
};
export type TestPaper = {
  id: string; title: string; description: string; durationMinutes: number;
  questions: TestQuestion[]; createdAt: number; updatedAt: number;
};
export type TestResponse = {
  value: number[] | string; markedReview: boolean; visited: boolean; visits: number;
  seconds: number; changes: number; errorCategory?: string;
};
export type AttemptEvent = {
  type: 'start' | 'visit' | 'answer' | 'clear' | 'review' | 'submit';
  at: number; questionId?: string; value?: number[] | string; markedReview?: boolean;
};
export type TestAttempt = {
  id: string; paper: TestPaper; status: 'running' | 'submitted'; startedAt: number;
  deadlineAt: number; lastTickAt: number; currentQuestionId: string;
  responses: Record<string, TestResponse>; events: AttemptEvent[];
  submittedAt?: number; submissionReason?: 'manual' | 'expired' | 'integrity';
  candidateName?: string; integrity?: TestIntegrity;
  displayOrder?: string[]; optionOrder?: Record<string, number[]>;
};
export type AttemptOptions = { candidateName?: string; integrityPolicy?: IntegrityPolicy };
export type QuestionResult = 'correct' | 'incorrect' | 'unattempted' | 'unvisited';
export type TimeCategory = 'Perfect' | 'Wasted' | 'Overtime' | 'Confused' | 'Other' | 'Unattempted';
export type QuestionAnalysis = {
  question: TestQuestion; response: TestResponse; status: QuestionResult; score: number;
  positiveScore: number; negativeScore: number; attempted: boolean; correct: boolean | null;
  timeSeconds: number; idealSeconds: number; timeCategory: TimeCategory; marksLost: number;
};
export type AnalysisGroup = {
  name: string; score: number; maxScore: number; positiveScore: number; negativeScore: number;
  attempted: number; correct: number; incorrect: number; unattempted: number; notVisited: number;
  total: number; timeSeconds: number; accuracy: number;
};
export type TestAnalysis = {
  attemptId: string; paperId: string; title: string; status: TestAttempt['status'];
  score: number; maxScore: number; positiveScore: number; negativeScore: number;
  attempted: number; correct: number; incorrect: number; unattempted: number; notVisited: number;
  timeSeconds: number; accuracy: number; completionPercent: number; durationSeconds: number;
  questionRows: QuestionAnalysis[]; subjects: AnalysisGroup[]; chapters: AnalysisGroup[];
  difficulties: AnalysisGroup[]; timeBuckets: { label: string; seconds: number; questions: number }[];
  efficiency: { label: TimeCategory; seconds: number; questions: number }[];
  journey: AttemptEvent[]; subjectMovement: { subject: string; at: number; questionId: string }[];
  painfulQuestions: QuestionAnalysis[]; errors: { label: string; questions: number; lostMarks: number }[];
  improvement: { recoverableMarks: number; scoreWithoutNegative: number; scoreIfIncorrectCorrect: number; scoreIfAllCorrect: number };
};
export type CohortRecord = {
  name: string; score: number; timeSeconds: number; attempted: number; correct: number;
  subjectScores?: Record<string, number>; paperId?: string; paperFingerprint?: string;
  questionResults?: { questionId: string; status: QuestionResult; timeSeconds: number; answeredAtSeconds?: number }[];
};
export type CohortEntry = CohortRecord;
export type CohortComparison = {
  count: number; rank: number | null; percentile: number | null; averageScore: number | null;
  topScore: number | null; averageTimeSeconds: number | null;
  scoreDistribution: { label: string; from: number; to: number; count: number }[];
  subjectComparisons: { name: string; yourScore: number; averageScore: number; topScore: number; count: number }[];
  method: string;
};

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string, max = 200, fallback?: string) => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} must contain 1–${max.toLocaleString()} characters.`);
  return value.trim();
};
const optionalText = (value: unknown, label: string, max = 10000) => {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} must be text of at most ${max.toLocaleString()} characters.`);
  return value;
};
const number = (value: unknown, label: string, min: number, max: number, fallback?: number) => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be a number between ${min} and ${max}.`);
  return value;
};
const integer = (value: unknown, label: string, min: number, max: number, fallback?: number) => {
  const result = number(value, label, min, max, fallback);
  if (!Number.isInteger(result)) throw new Error(`${label} must be a whole number.`);
  return result;
};
const newId = () => crypto.randomUUID();
const validNow = (now: number) => number(now, 'Timestamp', 0, Number.MAX_SAFE_INTEGER);
const rounded = (n: number) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;

export function validatePaper(value: unknown): TestPaper {
  const raw = object(value, 'Paper');
  if (!Array.isArray(raw.questions) || raw.questions.length < 1 || raw.questions.length > 1000) throw new Error('A paper must contain 1–1,000 questions.');
  const seen = new Set<string>();
  const questions = raw.questions.map((entry, index): TestQuestion => {
    const q = object(entry, `Question ${index + 1}`), label = `Question ${index + 1}`;
    const id = text(q.id, `${label} ID`, 200, newId());
    if (seen.has(id)) throw new Error(`${label} has a duplicate question ID.`);
    seen.add(id);
    if (!['single', 'multiple', 'numeric'].includes(q.kind as string)) throw new Error(`${label}: kind must be single, multiple or numeric.`);
    const kind = q.kind as QuestionKind;
    if (!['Easy', 'Moderate', 'Tough'].includes(q.difficulty as string)) throw new Error(`${label}: choose Easy, Moderate or Tough difficulty.`);
    let options: string[] = [], correctAnswers: number[] = [];
    if (kind !== 'numeric') {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 20) throw new Error(`${label} must have 2–20 options.`);
      options = q.options.map((option, i) => text(option, `${label} option ${i + 1}`, 10000));
      if (new Set(options.map(option => option.toLocaleLowerCase())).size !== options.length) throw new Error(`${label} contains duplicate options.`);
      if (!Array.isArray(q.correctAnswers) || !q.correctAnswers.length || (kind === 'single' && q.correctAnswers.length !== 1)) throw new Error(`${label} needs ${kind === 'single' ? 'one correct option' : 'at least one correct option'}.`);
      correctAnswers = q.correctAnswers.map(answer => integer(answer, `${label} answer index`, 0, options.length - 1));
      if (new Set(correctAnswers).size !== correctAnswers.length) throw new Error(`${label} contains duplicate correct answer indices.`);
      correctAnswers.sort((a, b) => a - b);
    }
    return {
      id, prompt: text(q.prompt, `${label} prompt`, 50000), subject: text(q.subject, `${label} subject`),
      chapter: optionalText(q.chapter, `${label} chapter`, 200), topic: optionalText(q.topic, `${label} topic`, 200),
      difficulty: q.difficulty as Difficulty, kind, options, correctAnswers,
      ...(kind === 'numeric' ? { numericAnswer: number(q.numericAnswer, `${label} numeric answer`, -1e15, 1e15), tolerance: number(q.tolerance, `${label} tolerance`, 0, 1e9, 0) } : {}),
      marks: number(q.marks, `${label} marks`, 0.001, 100000),
      negativeMarks: number(q.negativeMarks, `${label} negative marks`, 0, 100000, 0),
      idealSeconds: number(q.idealSeconds, `${label} target seconds`, 1, 86400, 120),
      explanation: optionalText(q.explanation, `${label} explanation`, 100000),
    };
  });
  const now = Date.now();
  return {
    id: text(raw.id, 'Paper ID', 200, newId()), title: text(raw.title, 'Paper title', 300),
    description: optionalText(raw.description, 'Paper description', 10000),
    durationMinutes: number(raw.durationMinutes, 'Duration in minutes', 1, 1440), questions,
    createdAt: number(raw.createdAt, 'Created timestamp', 0, Number.MAX_SAFE_INTEGER, now),
    updatedAt: number(raw.updatedAt, 'Updated timestamp', 0, Number.MAX_SAFE_INTEGER, now),
  };
}

export function parsePaperJSON(source: string): TestPaper {
  if (source.length > 15_000_000) throw new Error('Paper JSON is too large. Keep it below 15 MB.');
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error('The file is not valid JSON.'); }
  return validatePaper(parsed);
}

/** Stable paper revision label. This local FNV-1a identifier is not a security signature. */
export function paperFingerprint(paper: TestPaper): string {
  const canonical = JSON.stringify({
    durationMinutes: paper.durationMinutes,
    questions: paper.questions.map(q => ({
      id: q.id, prompt: q.prompt, subject: q.subject, chapter: q.chapter, topic: q.topic,
      difficulty: q.difficulty, kind: q.kind, options: q.options,
      correctAnswers: [...q.correctAnswers].sort((a, b) => a - b),
      numericAnswer: q.kind === 'numeric' ? q.numericAnswer : null,
      tolerance: q.kind === 'numeric' ? q.tolerance ?? 0 : null,
      marks: q.marks, negativeMarks: q.negativeMarks, idealSeconds: q.idealSeconds,
      explanation: q.explanation,
    })),
  });
  // Two 32-bit words implement FNV-1a 64-bit without expensive per-byte BigInt work.
  let high = 0xcbf29ce4, low = 0x84222325;
  for (const byte of new TextEncoder().encode(canonical)) {
    low = (low ^ byte) >>> 0;
    const product = low * 0x1b3;
    high = (high * 0x1b3 + low * 0x100 + Math.floor(product / 0x100000000)) >>> 0;
    low = product >>> 0;
  }
  return `vp1-${high.toString(16).padStart(8, '0')}${low.toString(16).padStart(8, '0')}`;
}

function snapshot(paper: TestPaper): TestPaper {
  const copy = validatePaper(paper);
  copy.questions.forEach(q => { Object.freeze(q.options); Object.freeze(q.correctAnswers); Object.freeze(q); });
  Object.freeze(copy.questions);
  return Object.freeze(copy);
}
function blankResponse(q: TestQuestion): TestResponse {
  return { value: q.kind === 'numeric' ? '' : [], markedReview: false, visited: false, visits: 0, seconds: 0, changes: 0 };
}
function normalizedValue(q: TestQuestion, value: unknown): number[] | string {
  if (q.kind === 'numeric') {
    if (typeof value !== 'string' || value.length > 100) throw new Error('A numeric response must be a number written as text.');
    const trimmed = value.trim();
    if (trimmed && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed) || !Number.isFinite(Number(trimmed)))) throw new Error('Enter a finite numeric answer.');
    return trimmed;
  }
  if (!Array.isArray(value) || value.length > q.options.length || (q.kind === 'single' && value.length > 1)) throw new Error('This response has an invalid number of options.');
  const options = value.map(v => integer(v, 'Selected option', 0, q.options.length - 1));
  if (new Set(options).size !== options.length) throw new Error('A response cannot select the same option twice.');
  return options.sort((a, b) => a - b);
}
export function hasAnswer(q: TestQuestion, response?: TestResponse): boolean {
  if (!response) return false;
  return q.kind === 'numeric' ? typeof response.value === 'string' && response.value.trim() !== '' && Number.isFinite(Number(response.value)) : Array.isArray(response.value) && response.value.length > 0;
}
export function questionStatus(q: TestQuestion, response?: TestResponse): 'unvisited' | 'unanswered' | 'answered' | 'review' | 'answered-review' {
  const answered = hasAnswer(q, response);
  if (response?.markedReview) return answered ? 'answered-review' : 'review';
  return answered ? 'answered' : response?.visited ? 'unanswered' : 'unvisited';
}

function candidateName(value: unknown): string | undefined {
  if (value === undefined || value === '') return undefined;
  const name = text(value, 'Candidate name', 100);
  if (/[\x00-\x1f\x7f]/.test(name)) throw new Error('Candidate name cannot contain control characters.');
  return name;
}
function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
/** Presentation order never changes the canonical question or answer-key snapshot. */
export function getAttemptQuestions(attempt: TestAttempt): TestQuestion[] {
  if (!attempt.displayOrder) return attempt.paper.questions;
  const byId = new Map(attempt.paper.questions.map(q => [q.id, q]));
  return attempt.displayOrder.map(id => byId.get(id)!);
}
export function getAttemptOptionOrder(attempt: TestAttempt, questionId: string): number[] {
  const question = getQuestion(attempt, questionId);
  return attempt.optionOrder?.[questionId] ?? question.options.map((_, index) => index);
}
export function createAttempt(paper: TestPaper, now = Date.now(), options: AttemptOptions = {}): TestAttempt {
  validNow(now);
  const copy = snapshot(paper), policy = validateIntegrityPolicy(options.integrityPolicy), name = candidateName(options.candidateName);
  const displayOrder = policy.shuffleQuestions ? [...new Set(copy.questions.map(q => q.subject))].flatMap(subject => shuffled(copy.questions.filter(q => q.subject === subject).map(q => q.id))) : undefined;
  const optionOrder = policy.shuffleOptions ? Object.fromEntries(copy.questions.filter(q => q.kind !== 'numeric').map(q => [q.id, shuffled(q.options.map((_, i) => i))])) : undefined;
  const first = displayOrder?.[0] ?? copy.questions[0].id;
  const responses = Object.fromEntries(copy.questions.map(q => [q.id, blankResponse(q)]));
  responses[first] = { ...responses[first], visited: true, visits: 1 };
  return { id: newId(), paper: copy, status: 'running', startedAt: now, deadlineAt: now + copy.durationMinutes * 60_000,
    lastTickAt: now, currentQuestionId: first, responses, events: [{ type: 'start', at: now, questionId: first }],
    integrity: createTestIntegrity(policy), ...(name ? { candidateName: name } : {}), ...(displayOrder ? { displayOrder } : {}), ...(optionOrder ? { optionOrder } : {}) };
}
function finish(attempt: TestAttempt, at: number, reason: 'manual' | 'expired' | 'integrity'): TestAttempt {
  return { ...attempt, status: 'submitted', submittedAt: at, submissionReason: reason,
    events: [...attempt.events, { type: 'submit', at }] };
}
/** An absolute deadline is authoritative across reloads and sleeping tabs. */
export function tickAttempt(attempt: TestAttempt, now = Date.now()): TestAttempt {
  if (attempt.status !== 'running') return attempt;
  validNow(now);
  const at = Math.max(attempt.lastTickAt, Math.min(now, attempt.deadlineAt));
  let next = attempt;
  if (at > attempt.lastTickAt) {
    const response = attempt.responses[attempt.currentQuestionId];
    next = { ...attempt, lastTickAt: at, responses: { ...attempt.responses,
      [attempt.currentQuestionId]: { ...response, seconds: rounded(response.seconds + (at - attempt.lastTickAt) / 1000) } } };
  }
  return now >= attempt.deadlineAt ? finish(next, attempt.deadlineAt, 'expired') : next;
}
function getQuestion(attempt: TestAttempt, id: string) {
  const q = attempt.paper.questions.find(question => question.id === id);
  if (!q) throw new Error('This question does not belong to the attempt.');
  return q;
}
export function visitQuestion(attempt: TestAttempt, id: string, now = Date.now()): TestAttempt {
  getQuestion(attempt, id);
  const next = tickAttempt(attempt, now);
  if (next.status !== 'running' || id === next.currentQuestionId) return next;
  return { ...next, currentQuestionId: id, responses: { ...next.responses, [id]: { ...next.responses[id], visited: true, visits: next.responses[id].visits + 1 } },
    events: [...next.events, { type: 'visit', at: next.lastTickAt, questionId: id }] };
}
export function answerQuestion(attempt: TestAttempt, id: string, value: number[] | string, now = Date.now()): TestAttempt {
  const q = getQuestion(attempt, id), next = tickAttempt(attempt, now);
  if (next.status !== 'running') return next;
  const normalized = normalizedValue(q, value), response = next.responses[id];
  if (JSON.stringify(normalized) === JSON.stringify(response.value)) return next;
  const firstVisit = !response.visited;
  const hadAnswer = next.events.some(event => event.questionId === id && event.type === 'answer');
  return { ...next, responses: { ...next.responses, [id]: { ...response, value: normalized, visited: true, visits: response.visits + (firstVisit ? 1 : 0), changes: response.changes + (hadAnswer ? 1 : 0) } },
    events: [...next.events, { type: hasAnswer(q, { ...response, value: normalized }) ? 'answer' : 'clear', at: next.lastTickAt, questionId: id, value: Array.isArray(normalized) ? [...normalized] : normalized }] };
}
export function clearAnswer(attempt: TestAttempt, id: string, now = Date.now()): TestAttempt {
  return answerQuestion(attempt, id, getQuestion(attempt, id).kind === 'numeric' ? '' : [], now);
}
export function toggleReview(attempt: TestAttempt, id: string, now = Date.now()): TestAttempt {
  getQuestion(attempt, id);
  const next = tickAttempt(attempt, now);
  if (next.status !== 'running') return next;
  const response = next.responses[id], markedReview = !response.markedReview;
  return { ...next, responses: { ...next.responses, [id]: { ...response, markedReview, visited: true, visits: response.visits + (response.visited ? 0 : 1) } },
    events: [...next.events, { type: 'review', at: next.lastTickAt, questionId: id, markedReview }] };
}
export function submitAttempt(attempt: TestAttempt, now = Date.now(), reason?: 'manual' | 'expired' | 'integrity'): TestAttempt {
  const next = tickAttempt(attempt, now);
  if (next.status === 'submitted') return next;
  if (reason === 'integrity' && (!next.integrity || next.integrity.policy.mode !== 'guarded' || next.integrity.policy.autoSubmitAfter === null || countIntegrityIncidents(next.integrity.events) < next.integrity.policy.autoSubmitAfter)) throw new Error('The selected integrity incident limit has not been reached.');
  return finish(next, next.lastTickAt, reason === 'integrity' ? 'integrity' : 'manual');
}
/** Keep browser observations on the same monotonic timeline as measured question time. */
export function recordIntegrityEvent(attempt: TestAttempt, value: IntegrityEvent): TestAttempt {
  if (attempt.status !== 'running') return attempt;
  const event = validateIntegrityEvent(value);
  if (event.questionId !== undefined) getQuestion(attempt, event.questionId);
  const next = tickAttempt(attempt, event.at);
  if (next.status !== 'running' || !next.integrity || next.integrity.policy.mode !== 'guarded') return next;
  const integrity = appendIntegrityEvent(next.integrity, { ...event, at: next.lastTickAt });
  return integrity === next.integrity ? next : { ...next, integrity };
}
/** User-authored diagnosis is permitted after submission without changing a score or answer. */
export function setErrorCategory(attempt: TestAttempt, id: string, category: string): TestAttempt {
  getQuestion(attempt, id);
  if (attempt.status !== 'submitted') throw new Error('Submit the attempt before adding an error diagnosis.');
  return { ...attempt, responses: { ...attempt.responses, [id]: { ...attempt.responses[id], errorCategory: optionalText(category, 'Error category', 200).trim() } } };
}

export function scoreQuestion(question: TestQuestion, response = blankResponse(question)): QuestionAnalysis {
  const attempted = hasAnswer(question, response);
  let correct: boolean | null = null;
  if (attempted) {
    if (question.kind === 'numeric') {
      const target = question.numericAnswer!, actual = Number(response.value), tolerance = question.tolerance ?? 0;
      correct = Math.abs(actual - target) <= tolerance + Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(target)) * 4;
    } else {
      const selected = Array.isArray(response.value) ? [...response.value].sort((a, b) => a - b) : [];
      const answers = [...question.correctAnswers].sort((a, b) => a - b);
      correct = selected.length === answers.length && selected.every((answer, index) => answer === answers[index]);
    }
  }
  const positiveScore = correct ? question.marks : 0, negativeScore = attempted && !correct ? question.negativeMarks : 0;
  const score = rounded(positiveScore - negativeScore);
  const status: QuestionResult = attempted ? correct ? 'correct' : 'incorrect' : response.visited ? 'unattempted' : 'unvisited';
  // These names describe explicit timing rules, never a diagnosis of knowledge or intent.
  const timeCategory: TimeCategory = attempted && response.seconds > question.idealSeconds ? 'Overtime'
    : correct ? 'Perfect' : attempted && response.seconds < question.idealSeconds / 2 ? 'Wasted'
    : !attempted && response.visited && response.seconds > question.idealSeconds ? 'Confused'
    : !attempted && !response.visited ? 'Unattempted' : 'Other';
  return { question, response, status, score, positiveScore, negativeScore, attempted, correct,
    timeSeconds: response.seconds, idealSeconds: question.idealSeconds, timeCategory, marksLost: rounded(question.marks - score) };
}
function aggregate(name: string, rows: QuestionAnalysis[]): AnalysisGroup {
  const correct = rows.filter(row => row.correct === true).length, attempted = rows.filter(row => row.attempted).length;
  return { name, score: rounded(rows.reduce((sum, row) => sum + row.score, 0)), maxScore: rounded(rows.reduce((sum, row) => sum + row.question.marks, 0)),
    positiveScore: rounded(rows.reduce((sum, row) => sum + row.positiveScore, 0)), negativeScore: rounded(rows.reduce((sum, row) => sum + row.negativeScore, 0)),
    attempted, correct, incorrect: attempted - correct, unattempted: rows.length - attempted, notVisited: rows.filter(row => !row.response.visited).length,
    total: rows.length, timeSeconds: rounded(rows.reduce((sum, row) => sum + row.timeSeconds, 0)), accuracy: attempted ? rounded(correct / attempted * 100) : 0 };
}
function groupRows(rows: QuestionAnalysis[], key: (row: QuestionAnalysis) => string) {
  const groups = new Map<string, QuestionAnalysis[]>();
  rows.forEach(row => { const name = key(row); groups.set(name, [...(groups.get(name) ?? []), row]); });
  return [...groups].map(([name, items]) => aggregate(name, items));
}
export function analyseAttempt(attempt: TestAttempt): TestAnalysis {
  const questionRows = attempt.paper.questions.map(q => scoreQuestion(q, attempt.responses[q.id]));
  const overall = aggregate('Overall', questionRows);
  const movement: TestAnalysis['subjectMovement'] = [];
  attempt.events.filter(event => event.type === 'start' || event.type === 'visit').forEach(event => {
    const question = attempt.paper.questions.find(q => q.id === event.questionId);
    if (question && movement.at(-1)?.subject !== question.subject) movement.push({ subject: question.subject, at: event.at, questionId: question.id });
  });
  const errors = new Map<string, { label: string; questions: number; lostMarks: number }>();
  questionRows.filter(row => !row.correct).forEach(row => {
    const label = row.response.errorCategory?.trim() || (row.status === 'unvisited' ? 'Never visited' : !row.attempted ? 'Viewed without answering' : row.timeSeconds > row.idealSeconds ? 'Incorrect over target time' : 'Incorrect within target time');
    const current = errors.get(label) ?? { label, questions: 0, lostMarks: 0 };
    errors.set(label, { ...current, questions: current.questions + 1, lostMarks: rounded(current.lostMarks + row.marksLost) });
  });
  const buckets = [{ label: 'Under 30s', min: 0, max: 30 }, { label: '30–60s', min: 30, max: 60 }, { label: '1–2m', min: 60, max: 120 }, { label: '2–3m', min: 120, max: 180 }, { label: '3m+', min: 180, max: Infinity }];
  return {
    attemptId: attempt.id, paperId: attempt.paper.id, title: attempt.paper.title, status: attempt.status,
    score: overall.score, maxScore: overall.maxScore, positiveScore: overall.positiveScore, negativeScore: overall.negativeScore,
    attempted: overall.attempted, correct: overall.correct, incorrect: overall.incorrect, unattempted: overall.unattempted,
    notVisited: overall.notVisited, timeSeconds: overall.timeSeconds, accuracy: overall.accuracy,
    completionPercent: rounded(overall.attempted / questionRows.length * 100), durationSeconds: attempt.paper.durationMinutes * 60,
    questionRows, subjects: groupRows(questionRows, row => row.question.subject),
    chapters: groupRows(questionRows, row => `${row.question.subject} · ${row.question.chapter || 'Uncategorised'}`),
    difficulties: (['Easy', 'Moderate', 'Tough'] as Difficulty[]).map(name => aggregate(name, questionRows.filter(row => row.question.difficulty === name))),
    timeBuckets: buckets.map(bucket => { const rows = questionRows.filter(row => row.timeSeconds >= bucket.min && row.timeSeconds < bucket.max); return { label: bucket.label, seconds: rounded(rows.reduce((sum, row) => sum + row.timeSeconds, 0)), questions: rows.length }; }),
    efficiency: (['Perfect', 'Wasted', 'Overtime', 'Confused', 'Other', 'Unattempted'] as TimeCategory[]).map(label => { const rows = questionRows.filter(row => row.timeCategory === label); return { label, seconds: rounded(rows.reduce((sum, row) => sum + row.timeSeconds, 0)), questions: rows.length }; }),
    journey: attempt.events.map(event => ({ ...event, ...(Array.isArray(event.value) ? { value: [...event.value] } : {}) })), subjectMovement: movement,
    painfulQuestions: questionRows.filter(row => row.status === 'incorrect' && row.timeSeconds > row.idealSeconds).sort((a, b) => b.marksLost - a.marksLost || b.timeSeconds - a.timeSeconds),
    errors: [...errors.values()].sort((a, b) => b.lostMarks - a.lostMarks),
    improvement: { recoverableMarks: rounded(overall.maxScore - overall.score), scoreWithoutNegative: overall.positiveScore,
      scoreIfIncorrectCorrect: rounded(overall.score + questionRows.filter(row => row.status === 'incorrect').reduce((sum, row) => sum + row.marksLost, 0)), scoreIfAllCorrect: overall.maxScore },
  };
}

export function validateAttempt(value: unknown): TestAttempt {
  const raw = object(value, 'Attempt'), paper = snapshot(validatePaper(raw.paper));
  const startedAt = number(raw.startedAt, 'Start timestamp', 0, Number.MAX_SAFE_INTEGER);
  const deadlineAt = number(raw.deadlineAt, 'Deadline timestamp', startedAt, Number.MAX_SAFE_INTEGER);
  if (Math.abs(deadlineAt - startedAt - paper.durationMinutes * 60_000) > 1) throw new Error('The attempt deadline does not match its paper duration.');
  const lastTickAt = number(raw.lastTickAt, 'Last activity timestamp', startedAt, deadlineAt);
  if (raw.status !== 'running' && raw.status !== 'submitted') throw new Error('Invalid attempt status.');
  const currentQuestionId = text(raw.currentQuestionId, 'Current question ID');
  if (!paper.questions.some(q => q.id === currentQuestionId)) throw new Error('The current question is missing from the paper.');
  const name = candidateName(raw.candidateName);
  let displayOrder: string[] | undefined, optionOrder: Record<string, number[]> | undefined;
  const questionIds = new Set(paper.questions.map(q => q.id));
  if (raw.displayOrder !== undefined) {
    if (!Array.isArray(raw.displayOrder) || raw.displayOrder.length !== questionIds.size || new Set(raw.displayOrder).size !== questionIds.size || raw.displayOrder.some(id => typeof id !== 'string' || !questionIds.has(id))) throw new Error('Question display order must be an exact permutation of the paper.');
    displayOrder = [...raw.displayOrder] as string[];
  }
  if (raw.optionOrder !== undefined) {
    const orders = object(raw.optionOrder, 'Option display order');
    optionOrder = Object.fromEntries(Object.entries(orders).map(([id, values]) => {
      const q = paper.questions.find(question => question.id === id);
      if (!q || q.kind === 'numeric' || !Array.isArray(values) || values.length !== q.options.length || new Set(values).size !== q.options.length || values.some(index => !Number.isInteger(index) || index < 0 || index >= q.options.length)) throw new Error('Option display order must be an exact permutation of known choice indices.');
      return [id, [...values] as number[]];
    }));
  }
  const integrity = raw.integrity === undefined ? undefined : validateTestIntegrity(raw.integrity);
  for (const event of integrity?.events ?? []) {
    if (event.at < startedAt || event.at > lastTickAt) throw new Error('Integrity observations must be within the attempt timeline.');
    if (event.questionId !== undefined && !questionIds.has(event.questionId)) throw new Error('An integrity observation references an unknown question.');
  }
  const rawResponses = object(raw.responses, 'Responses');
  const responses = Object.fromEntries(paper.questions.map(q => {
    const r = object(rawResponses[q.id], 'Question response');
    if (typeof r.markedReview !== 'boolean' || typeof r.visited !== 'boolean') throw new Error('Invalid response status.');
    const visits = integer(r.visits, 'Question visits', 0, 1_000_000);
    if (r.visited !== (visits > 0)) throw new Error('Question visits do not match its visited state.');
    const response: TestResponse = { value: normalizedValue(q, r.value), markedReview: r.markedReview, visited: r.visited,
      visits, seconds: number(r.seconds, 'Question time', 0, paper.durationMinutes * 60), changes: integer(r.changes, 'Answer changes', 0, 1_000_000),
      ...(r.errorCategory === undefined ? {} : { errorCategory: optionalText(r.errorCategory, 'Error category', 200) }) };
    if ((hasAnswer(q, response) || response.markedReview || response.seconds > 0) && !response.visited) throw new Error('An active response must be marked visited.');
    return [q.id, response];
  }));
  if (!responses[currentQuestionId].visited) throw new Error('The current question must be marked visited.');
  const trackedSeconds = Object.values(responses).reduce((sum, response) => sum + response.seconds, 0);
  if (Math.abs(trackedSeconds - (lastTickAt - startedAt) / 1000) > 0.01) throw new Error('The saved question times do not match the elapsed attempt time.');
  if (!Array.isArray(raw.events) || raw.events.length < 1 || raw.events.length > 100_000) throw new Error('Invalid attempt event history.');
  let previousAt = startedAt;
  const events = raw.events.map((entry): AttemptEvent => {
    const event = object(entry, 'Attempt event');
    if (!['start', 'visit', 'answer', 'clear', 'review', 'submit'].includes(event.type as string)) throw new Error('Invalid event type.');
    const at = number(event.at, 'Event timestamp', previousAt, lastTickAt); previousAt = at;
    const question = event.questionId === undefined ? undefined : paper.questions.find(q => q.id === event.questionId);
    if (event.questionId !== undefined && !question) throw new Error('An event references an unknown question.');
    if (event.type !== 'submit' && !question) throw new Error('Question events must identify their question.');
    if (event.markedReview !== undefined && typeof event.markedReview !== 'boolean') throw new Error('Invalid review event.');
    if (event.type === 'review' && typeof event.markedReview !== 'boolean') throw new Error('Review events must record their state.');
    if ((event.type === 'answer' || event.type === 'clear') && event.value === undefined) throw new Error('Answer events must record their value.');
    if (event.value !== undefined && !question) throw new Error('Only question events can contain an answer.');
    return { type: event.type as AttemptEvent['type'], at, ...(question ? { questionId: question.id } : {}),
      ...(event.value === undefined ? {} : { value: normalizedValue(question!, event.value) }),
      ...(event.markedReview === undefined ? {} : { markedReview: event.markedReview as boolean }) };
  });
  if (events[0].type !== 'start' || events[0].at !== startedAt || events.filter(event => event.type === 'start').length !== 1) throw new Error('Attempt history must begin with exactly one start event.');
  const submissions = events.filter(event => event.type === 'submit');
  if (raw.status === 'running' && submissions.length) throw new Error('A running attempt cannot already contain a submission.');
  let submittedAt: number | undefined, submissionReason: TestAttempt['submissionReason'];
  if (raw.status === 'submitted') {
    submittedAt = number(raw.submittedAt, 'Submitted timestamp', startedAt, deadlineAt);
    if (submittedAt !== lastTickAt || events.at(-1)?.type !== 'submit' || events.at(-1)?.at !== submittedAt || submissions.length !== 1) throw new Error('A submitted attempt must have a final submission event and matching time.');
    if (raw.submissionReason !== 'manual' && raw.submissionReason !== 'expired' && raw.submissionReason !== 'integrity') throw new Error('Invalid submission reason.');
    submissionReason = raw.submissionReason;
    if (submissionReason === 'expired' && submittedAt !== deadlineAt) throw new Error('An expired attempt must finish at its deadline.');
    if (submissionReason === 'integrity' && (!integrity || integrity.policy.mode !== 'guarded' || integrity.policy.autoSubmitAfter === null || countIntegrityIncidents(integrity.events) < integrity.policy.autoSubmitAfter)) throw new Error('Integrity submission requires the selected incident limit to have been reached.');
  }
  return { id: text(raw.id, 'Attempt ID'), paper, status: raw.status, startedAt, deadlineAt, lastTickAt,
    currentQuestionId, responses, events, ...(submittedAt === undefined ? {} : { submittedAt, submissionReason }),
    ...(name ? { candidateName: name } : {}), ...(integrity ? { integrity } : {}), ...(displayOrder ? { displayOrder } : {}), ...(optionOrder ? { optionOrder } : {}) };
}

export function parseCohortJSON(source: string): CohortRecord[] {
  if (source.length > 15_000_000) throw new Error('Comparison JSON is too large. Keep it below 15 MB.');
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error('Comparison data must be valid JSON.'); }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 100_000) throw new Error('Import an array of 1–100,000 real comparison records.');
  return parsed.map((entry, index) => {
    const raw = object(entry, `Comparison row ${index + 1}`), attempted = integer(raw.attempted, 'Attempted count', 0, 1000), correct = integer(raw.correct, 'Correct count', 0, attempted);
    const timeSeconds = number(raw.timeSeconds, 'Time in seconds', 0, 86400);
    let fingerprint: string | undefined;
    if (raw.paperFingerprint !== undefined) {
      fingerprint = text(raw.paperFingerprint, 'Paper fingerprint', 100);
      if (!/^vp1-[0-9a-f]{16}$/.test(fingerprint)) throw new Error('The paper fingerprint has an unsupported format.');
    }
    const subjects = raw.subjectScores === undefined ? undefined : object(raw.subjectScores, 'Subject scores');
    if (subjects && Object.keys(subjects).length > 1000) throw new Error('A comparison record contains too many subject scores.');
    let questionResults: CohortRecord['questionResults'];
    if (raw.questionResults !== undefined) {
      if (!Array.isArray(raw.questionResults) || raw.questionResults.length > 1000) throw new Error('Question results must contain at most 1,000 records.');
      const seen = new Set<string>();
      questionResults = raw.questionResults.map(entry => {
        const result = object(entry, 'Comparison question result'), questionId = text(result.questionId, 'Question ID');
        if (seen.has(questionId)) throw new Error('A comparison record contains a duplicate question result.');
        seen.add(questionId);
        if (!['correct', 'incorrect', 'unattempted', 'unvisited'].includes(result.status as string)) throw new Error('Invalid comparison question status.');
        const resultTime = number(result.timeSeconds, 'Question time in seconds', 0, timeSeconds);
        if (result.status === 'unvisited' && resultTime > 0) throw new Error('An unvisited question cannot have recorded viewing time.');
        if ((result.status === 'unattempted' || result.status === 'unvisited') && result.answeredAtSeconds !== undefined) throw new Error('An unanswered question cannot have an answer timestamp.');
        return { questionId, status: result.status as QuestionResult, timeSeconds: resultTime,
          ...(result.answeredAtSeconds === undefined ? {} : { answeredAtSeconds: number(result.answeredAtSeconds, 'Answer time in seconds', 0, timeSeconds) }) };
      });
      if (questionResults.reduce((sum, result) => sum + result.timeSeconds, 0) > timeSeconds + 0.01) throw new Error('Imported question times exceed the total attempt time.');
      if (questionResults.filter(result => result.status === 'correct').length > correct || questionResults.filter(result => result.status === 'incorrect').length > attempted - correct) throw new Error('Imported question results do not match the correct and attempted counts.');
    }
    return { name: text(raw.name, `Comparison row ${index + 1} name`, 300), score: number(raw.score, 'Score', -1e9, 1e9), timeSeconds, attempted, correct,
      ...(subjects ? { subjectScores: Object.fromEntries(Object.entries(subjects).map(([name, score]) => [text(name, 'Subject name'), number(score, 'Subject score', -1e9, 1e9)])) } : {}),
      ...(raw.paperId === undefined ? {} : { paperId: text(raw.paperId, 'Comparison paper ID') }), ...(fingerprint ? { paperFingerprint: fingerprint } : {}), ...(questionResults ? { questionResults } : {}) };
  });
}
export function compareCohort(analysis: TestAnalysis, records: CohortRecord[]): CohortComparison {
  const method = 'Imported cohort only. Rank = 1 + records with a higher score (ties share rank). Empirical percentile = 100 × (lower scores + half of equal scores) ÷ cohort size. The current attempt is not automatically added. This is not an exam prediction.';
  if (!records.length) return { count: 0, rank: null, percentile: null, averageScore: null, topScore: null, averageTimeSeconds: null, scoreDistribution: [], subjectComparisons: [], method };
  const scores = records.map(record => record.score), lower = scores.filter(score => score < analysis.score).length, equal = scores.filter(score => score === analysis.score).length;
  const low = scores.reduce((min, score) => Math.min(min, score), Math.min(0, analysis.score)), high = scores.reduce((max, score) => Math.max(max, score), Math.max(1, analysis.maxScore, analysis.score)), width = (high - low) / 5;
  const scoreDistribution = Array.from({ length: 5 }, (_, index) => {
    const from = low + index * width, to = index === 4 ? high : low + (index + 1) * width;
    return { label: `${Math.round(from)}–${Math.round(to)}`, from: rounded(from), to: rounded(to), count: scores.filter(score => score >= from && (index === 4 ? score <= to : score < to)).length };
  });
  return { count: records.length, rank: 1 + scores.filter(score => score > analysis.score).length,
    percentile: rounded((lower + equal / 2) / records.length * 100), averageScore: rounded(scores.reduce((sum, score) => sum + score, 0) / records.length),
    topScore: scores.reduce((max, score) => Math.max(max, score), -Infinity), averageTimeSeconds: rounded(records.reduce((sum, record) => sum + record.timeSeconds, 0) / records.length), scoreDistribution,
    subjectComparisons: analysis.subjects.flatMap(subject => {
      const values = records.flatMap(record => record.subjectScores && Object.hasOwn(record.subjectScores, subject.name) ? [record.subjectScores[subject.name]] : []);
      return values.length ? [{ name: subject.name, yourScore: subject.score, averageScore: rounded(values.reduce((sum, value) => sum + value, 0) / values.length), topScore: values.reduce((max, value) => Math.max(max, value), -Infinity), count: values.length }] : [];
    }), method };
}
