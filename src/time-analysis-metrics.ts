import type { CohortRecord, QuestionAnalysis, TestAnalysis, TestAttempt, TestPaper } from './testing-model';
import { paperFingerprint } from './testing-model';
import { getTimeJourney } from './result-metrics';

export type TimeOutcome = 'total' | 'correct' | 'incorrect';
export type TimeComparisonRow = { key: string; label: string; members: number; included: number; timeSeconds: number | null; attemptPercent: number | null; accuracyPercent: number | null };
export type HourlyComparisonRow = { key: string; label: string; members: number; included: number; missingTimestamps: number; counts: number[] | null };
export type TimePeerGroup = { key: string; label: string; records: CohortRecord[] };
const rounded = (value: number) => Math.round((value + Number.EPSILON) * 1e6) / 1e6;
const mean = (values: number[]) => values.length ? rounded(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

/** Rank the full imported cohort once. Include score ties at a percentile boundary
 * rather than choosing different peers when the subject or chart filter changes. */
export function getTimePeerGroups(records: CohortRecord[]): TimePeerGroup[] {
  if (!records.length) return [];
  const sorted = [...records].sort((a, b) => b.score - a.score);
  const top = (share: number) => { const cutoff = sorted[Math.max(0, Math.ceil(sorted.length * share) - 1)].score; return sorted.filter(record => record.score >= cutoff); };
  return [
    { key: 'topper', label: 'Top scorer', records: sorted.filter(record => record.score === sorted[0].score) },
    { key: 'top10', label: 'Top 10% of imported cohort', records: top(.1) },
    { key: 'top25', label: 'Top 25% of imported cohort', records: top(.25) },
  ];
}

function samePaper(record: CohortRecord, paper: TestPaper, fingerprint: string) {
  return (!record.paperId || record.paperId === paper.id) && (!record.paperFingerprint || record.paperFingerprint === fingerprint);
}
function fullDetails(record: CohortRecord, paper: TestPaper) {
  const rows = record.questionResults;
  if (!rows || rows.length !== paper.questions.length || new Set(rows.map(row => row.questionId)).size !== paper.questions.length) return null;
  const ids = new Set(paper.questions.map(question => question.id));
  return rows.every(row => ids.has(row.questionId) && ['correct', 'incorrect', 'unattempted', 'unvisited'].includes(row.status) && Number.isFinite(row.timeSeconds) && row.timeSeconds >= 0) ? rows : null;
}

/** Summary-only peers can support an overall row, but never a subject row. */
export function getTimeComparisonRows(attempt: TestAttempt, analysis: TestAnalysis, records: CohortRecord[], subject: string | null): TimeComparisonRow[] {
  const selected = analysis.questionRows.filter(row => subject === null || row.question.subject === subject), total = selected.length;
  const attempted = selected.filter(row => row.attempted).length, correct = selected.filter(row => row.status === 'correct').length;
  const yours: TimeComparisonRow = { key: 'you', label: 'You', members: 1, included: 1,
    timeSeconds: rounded(selected.reduce((sum, row) => sum + row.timeSeconds, 0)), attemptPercent: total ? rounded(attempted / total * 100) : null, accuracyPercent: attempted ? rounded(correct / attempted * 100) : 0 };
  const fingerprint = paperFingerprint(attempt.paper), valid = records.filter(record => samePaper(record, attempt.paper, fingerprint));
  const selectedIds = new Set(selected.map(row => row.question.id));
  return [yours, ...getTimePeerGroups(valid).map(group => {
    const metrics = group.records.flatMap(record => {
      if (subject === null) return Number.isFinite(record.timeSeconds) && record.timeSeconds >= 0 && record.attempted >= 0 && record.attempted <= total && record.correct >= 0 && record.correct <= record.attempted
        ? [{ seconds: record.timeSeconds, attempted: total ? record.attempted / total * 100 : 0, accuracy: record.attempted ? record.correct / record.attempted * 100 : 0 }] : [];
      const details = fullDetails(record, attempt.paper)?.filter(row => selectedIds.has(row.questionId));
      if (!details || !total) return [];
      const answered = details.filter(row => row.status === 'correct' || row.status === 'incorrect').length, correct = details.filter(row => row.status === 'correct').length;
      return [{ seconds: details.reduce((sum, row) => sum + row.timeSeconds, 0), attempted: answered / total * 100, accuracy: answered ? correct / answered * 100 : 0 }];
    });
    return { key: group.key, label: group.label, members: group.records.length, included: metrics.length, timeSeconds: mean(metrics.map(row => row.seconds)), attemptPercent: mean(metrics.map(row => row.attempted)), accuracyPercent: mean(metrics.map(row => row.accuracy)) };
  })];
}

const wanted = (status: string, outcome: TimeOutcome) => outcome === 'total' ? status === 'correct' || status === 'incorrect' : status === outcome;
export function answerTimestampCoverage(attempt: TestAttempt, rows: QuestionAnalysis[], outcome: TimeOutcome = 'total') {
  const answers = new Map<string, number>();
  for (const event of attempt.events) if (event.type === 'answer' && event.questionId) answers.set(event.questionId, event.at);
  const selected = rows.filter(row => wanted(row.status, outcome));
  const missing = selected.filter(row => { const at = answers.get(row.question.id); return at === undefined || !Number.isFinite(at) || at < attempt.startedAt || at > attempt.deadlineAt; }).length;
  return { answered: selected.length, missing };
}

/** A missing final-answer timestamp makes that person's hourly distribution
 * unavailable. It is never converted into a zero in an arbitrary interval. */
export function getHourlyComparison(attempt: TestAttempt, analysis: TestAnalysis, records: CohortRecord[], outcome: TimeOutcome, intervalMinutes = 60) {
  const bins = getTimeJourney(attempt, analysis.questionRows, intervalMinutes), coverage = answerTimestampCoverage(attempt, analysis.questionRows, outcome);
  const yours: HourlyComparisonRow = { key: 'you', label: 'You', members: 1, included: coverage.missing ? 0 : 1, missingTimestamps: coverage.missing, counts: coverage.missing ? null : bins.map(bin => bin[outcome]) };
  const seconds = intervalMinutes * 60, duration = attempt.paper.durationMinutes * 60, fingerprint = paperFingerprint(attempt.paper);
  const valid = records.filter(record => samePaper(record, attempt.paper, fingerprint));
  const peers: HourlyComparisonRow[] = getTimePeerGroups(valid).map(group => {
    let missingTimestamps = 0;
    const counts = group.records.flatMap(record => {
      const details = fullDetails(record, attempt.paper);
      if (!details) return [];
      const answers = details.filter(row => wanted(row.status, outcome));
      const missing = answers.filter(row => row.answeredAtSeconds === undefined || !Number.isFinite(row.answeredAtSeconds) || row.answeredAtSeconds < 0 || row.answeredAtSeconds > duration).length;
      missingTimestamps += missing;
      if (missing) return [];
      const values = bins.map(() => 0);
      for (const row of answers) if (values.length) values[Math.min(Math.floor(row.answeredAtSeconds! / seconds), values.length - 1)]++;
      return [values];
    });
    return { key: group.key, label: group.label, members: group.records.length, included: counts.length, missingTimestamps, counts: counts.length ? bins.map((_, index) => mean(counts.map(row => row[index]))!) : null };
  });
  return { bins, rows: [yours, ...peers], outcome, intervalMinutes };
}
