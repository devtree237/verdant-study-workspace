import type { AnalysisGroup, AttemptEvent, Difficulty, QuestionAnalysis, TestAttempt } from './testing-model';

export type TimeJourneyBin = {
  label: string; fromSeconds: number; toSeconds: number;
  correct: number; incorrect: number; total: number;
};
export type TimeQuality = {
  totalSeconds: number; correctSeconds: number; incorrectSeconds: number; unansweredSeconds: number;
  correctPercent: number; incorrectPercent: number; unansweredPercent: number;
};
export type ErrorOptimization = {
  actualScore: number; maxScore: number; negativeMarks: number;
  scenarios: { label: string; reduction: number; actualScore: number; improvement: number; score: number }[];
};

const rounded = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;

/** Counts final answers at their recorded save time, rather than inferring time from time spent. */
export function getTimeJourney(attempt: TestAttempt, questionRows: QuestionAnalysis[], intervalMinutes = 30): TimeJourneyBin[] {
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) throw new Error('The journey interval must be a positive number of minutes.');
  const durationSeconds = attempt.paper.durationMinutes * 60;
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) throw new Error('The paper duration is invalid.');
  if (!durationSeconds) return [];
  const intervalSeconds = Math.min(intervalMinutes * 60, durationSeconds), count = Math.ceil(durationSeconds / intervalSeconds);
  if (!Number.isSafeInteger(count) || count > 10_000) throw new Error('Choose a larger journey interval.');
  const bins = Array.from({ length: count }, (_, index): TimeJourneyBin => {
    const fromSeconds = index * intervalSeconds, toSeconds = Math.min((index + 1) * intervalSeconds, durationSeconds);
    return { label: `${rounded(fromSeconds / 60)}–${rounded(toSeconds / 60)} min`, fromSeconds, toSeconds, correct: 0, incorrect: 0, total: 0 };
  });
  const finalAnswers = new Map<string, AttemptEvent>();
  for (const event of attempt.events) if (event.type === 'answer' && event.questionId) finalAnswers.set(event.questionId, event);
  for (const row of questionRows) {
    if (row.status !== 'correct' && row.status !== 'incorrect') continue;
    const event = finalAnswers.get(row.question.id);
    if (!event) continue; // A missing history entry cannot be replaced by a guessed answer time.
    if (!Number.isFinite(event.at) || event.at < attempt.startedAt || event.at > attempt.deadlineAt) continue;
    // Compare absolute timestamps first: decimal minutes and milliseconds can round differently.
    const seconds = Math.min((event.at - attempt.startedAt) / 1000, durationSeconds);
    // Interior bounds belong to the next interval; the duration endpoint belongs to the final bin.
    const bin = bins[Math.min(Math.floor(seconds / intervalSeconds), bins.length - 1)];
    bin[row.status] += 1;
    bin.total += 1;
  }
  return bins;
}

/** Time for viewed-unanswered and unvisited questions is one disjoint unanswered category. */
export function getTimeQuality(rows: QuestionAnalysis[]): TimeQuality {
  let correctSeconds = 0, incorrectSeconds = 0, unansweredSeconds = 0;
  for (const row of rows) {
    if (row.status === 'correct') correctSeconds += row.timeSeconds;
    else if (row.status === 'incorrect') incorrectSeconds += row.timeSeconds;
    else unansweredSeconds += row.timeSeconds;
  }
  correctSeconds = rounded(correctSeconds); incorrectSeconds = rounded(incorrectSeconds); unansweredSeconds = rounded(unansweredSeconds);
  const totalSeconds = rounded(correctSeconds + incorrectSeconds + unansweredSeconds);
  return { totalSeconds, correctSeconds, incorrectSeconds, unansweredSeconds,
    correctPercent: totalSeconds ? rounded(correctSeconds / totalSeconds * 100) : 0,
    incorrectPercent: totalSeconds ? rounded(incorrectSeconds / totalSeconds * 100) : 0,
    unansweredPercent: totalSeconds ? rounded(unansweredSeconds / totalSeconds * 100) : 0 };
}

/** Recovers a hypothetical share of incorrect-answer lost marks; unanswered questions stay unchanged. */
export function getErrorOptimization(rows: QuestionAnalysis[]): ErrorOptimization {
  const actualScore = rounded(rows.reduce((sum, row) => sum + row.score, 0));
  const maxScore = rounded(rows.reduce((sum, row) => sum + row.question.marks, 0));
  const negativeMarks = rounded(rows.filter(row => row.status === 'incorrect').reduce((sum, row) => sum + row.negativeScore, 0));
  const incorrectLostMarks = rounded(rows.filter(row => row.status === 'incorrect').reduce((sum, row) => sum + row.marksLost, 0));
  const scenarios = [
    { label: 'Actual score', reduction: 0 },
    { label: '50% less error', reduction: .5 },
    { label: '100% less error', reduction: 1 },
  ].map(scenario => {
    const improvement = rounded(incorrectLostMarks * scenario.reduction);
    return { ...scenario, actualScore, improvement, score: rounded(actualScore + improvement) };
  });
  return { actualScore, maxScore, negativeMarks, scenarios };
}

/** Works on all questions or any subject-filtered subset without reading external workspace state. */
export function getDifficultyGroups(rows: QuestionAnalysis[]): AnalysisGroup[] {
  return (['Easy', 'Moderate', 'Tough'] as Difficulty[]).map(name => {
    const group = rows.filter(row => row.question.difficulty === name);
    const correct = group.filter(row => row.status === 'correct').length;
    const incorrect = group.filter(row => row.status === 'incorrect').length;
    const attempted = correct + incorrect;
    return { name, score: rounded(group.reduce((sum, row) => sum + row.score, 0)),
      maxScore: rounded(group.reduce((sum, row) => sum + row.question.marks, 0)),
      positiveScore: rounded(group.reduce((sum, row) => sum + row.positiveScore, 0)),
      negativeScore: rounded(group.reduce((sum, row) => sum + row.negativeScore, 0)),
      attempted, correct, incorrect, unattempted: group.length - attempted,
      notVisited: group.filter(row => row.status === 'unvisited').length,
      total: group.length, timeSeconds: rounded(group.reduce((sum, row) => sum + row.timeSeconds, 0)),
      accuracy: attempted ? rounded(correct / attempted * 100) : 0 };
  });
}
