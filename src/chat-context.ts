import type { ChatContextSnapshot, Conversation } from './chat-api';
import { MAX_ATTACHMENT_TEXT } from './chat-api';
import type { State, Task } from './model';
import { day } from './model';
import { taskCompletionDay } from './task-history';
import type { TestAttempt } from './testing-model';
import { analyseAttempt } from './testing-model';

export type ChatContextKind = 'mistakes' | 'daily' | 'history';
export type ChatContextDocument = { id: string; title: string; text: string; pages: number };
export type ChatCompletedTask = Task & { measuredSeconds?: number; subjectName?: string };
export const CHAT_CONNECTORS: { id: ChatContextKind; label: string; description: string }[] = [
  { id: 'mistakes', label: 'Mistake Vault', description: 'Logged mistakes and only the vault documents you select' },
  { id: 'daily', label: 'Daily Tracker', description: 'Today’s tasks, active study work, and your recorded streak' },
  { id: 'history', label: 'History', description: 'Completed task archive, focus records, and saved test results' },
];

/** Builds snapshots only for explicitly selected connectors. It never reads a
 * document, fetches a URL, infers time from an estimate, or silently truncates. */
export function buildWorkspaceContexts({ selected, workspace, completedTasks = [], attempts = [], documents = [], now = new Date() }: {
  selected: ChatContextKind[]; workspace: State; completedTasks?: ChatCompletedTask[]; attempts?: TestAttempt[]; documents?: ChatContextDocument[]; now?: Date;
}): ChatContextSnapshot[] {
  const today = day(0, now), subject = (id: string) => workspace.subjects.find(item => item.id === id)?.name || id || 'Unassigned';
  const taskData = (task: Task) => ({ title: task.title, subject: subject(task.subject), stage: task.stage, due: task.due || null, priority: task.priority, plannedMinutes: task.duration, notes: task.notes, labels: task.labels, subtasks: task.subtasks.map(item => ({ title: item.title, done: item.done })) });
  const completed = [...new Map([...workspace.tasks.filter(task => task.done), ...completedTasks].map(task => [task.id, task])).values()];
  const snapshots = [...new Set(selected)].map(id => {
    let value: unknown;
    if (id === 'mistakes') value = { note: 'User selected Mistake Vault. Uploaded document text is limited to the documents explicitly selected below. No other vault files or URLs were read.', mistakes: workspace.mistakes.map(mistake => ({ title: mistake.title, subject: subject(mistake.subject), topic: mistake.topic, category: mistake.category, status: mistake.status, question: mistake.prompt, wrongAnswer: mistake.wrong, solution: mistake.solution, takeaway: mistake.takeaway, reviewDate: mistake.review, attempts: mistake.attempts })), selectedDocuments: documents.map(document => ({ title: document.title, pages: document.pages, text: document.text })) };
    else if (id === 'daily') {
      const dates = new Set(completed.map(taskCompletionDay).filter(date => date !== 'unknown')); let streak = 0, offset = dates.has(today) ? 0 : -1;
      while (dates.has(day(offset - streak, now))) streak++;
      value = { asOf: today, recordedStudyStreakDays: streak, streakDefinition: 'Consecutive calendar dates with a completed task, ending today or yesterday.', tasks: workspace.tasks.filter(task => !task.done && (task.due === today || task.stage === 'In progress' || task.stage === 'Practicing')).map(taskData), completedToday: completed.filter(task => taskCompletionDay(task) === today).length, note: 'plannedMinutes are task estimates, not measured study time.' };
    } else {
      value = { completedTasks: completed.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || '')).map(task => ({ ...taskData(task), subject: ('subjectName' in task && typeof task.subjectName === 'string' ? task.subjectName : undefined) || subject(task.subject), completedDate: task.completedAt || null, measuredSeconds: 'measuredSeconds' in task && typeof task.measuredSeconds === 'number' ? task.measuredSeconds : null })), focusLog: workspace.focusLog, assessments: workspace.assessments.map(item => ({ title: item.title, subject: subject(item.subject), recordedScore: item.score, date: item.date })), testResults: attempts.filter(attempt => attempt.status === 'submitted').map(attempt => { const result = analyseAttempt(attempt); return { title: result.title, submittedAt: attempt.submittedAt, score: result.score, maximum: result.maxScore, attempted: result.attempted, correct: result.correct, accuracyPercent: result.accuracy, recordedSeconds: result.timeSeconds, subjects: result.subjects.map(item => ({ subject: item.name, score: item.score, maximum: item.maxScore, accuracyPercent: item.accuracy })) }; }), note: 'Null measuredSeconds means no measured task duration was recorded. Planned task duration is not elapsed time.' };
    }
    return { id, label: CHAT_CONNECTORS.find(item => item.id === id)!.label, text: JSON.stringify(value, null, 2) };
  });
  if (snapshots.reduce((sum, context) => sum + context.text.length, 0) > MAX_ATTACHMENT_TEXT) throw new Error('Selected workspace context exceeds 120,000 characters. Deselect a connector or use fewer documents; nothing was truncated.');
  return snapshots;
}

export function groupChatHistory(chats: Conversation[], now = new Date()): { label: string; chats: Conversation[] }[] {
  const labels = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];
  const groups = labels.map(label => ({ label, chats: [] as Conversation[] }));
  const today = day(0, now), yesterday = day(-1, now), week = day(-7, now);
  for (const chat of [...chats].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const date = day(0, new Date(chat.updatedAt));
    groups[date === today ? 0 : date === yesterday ? 1 : date >= week ? 2 : 3].chats.push(chat);
  }
  return groups.filter(group => group.chats.length);
}
