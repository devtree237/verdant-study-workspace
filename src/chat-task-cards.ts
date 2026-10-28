import type { ChatContextSnapshot } from './chat-api';
import { MAX_ATTACHMENT_TEXT, MAX_CHAT_CONTEXT } from './chat-api';
import type { Stage, State, Subject, Task, TaskHistoryEntry } from './model';

export type ChatTaskCard = Readonly<{
  id?: string;
  title: string;
  subject: string;
  stage: Stage | null;
  done: boolean;
  due: string | null;
  completedDate: string | null;
  plannedMinutes: number | null;
  measuredSeconds: number | null;
  priority: number | null;
  notes: string;
  labels: readonly string[];
  subtasks: readonly Readonly<{ title: string; done: boolean }>[];
}>;
export type ChatTaskSnapshot = Readonly<{
  id: string;
  label: string;
  kind: 'daily' | 'history' | 'task';
  tasks: readonly ChatTaskCard[];
  asOf?: string;
  recordedStudyStreakDays?: number;
  completedToday?: number;
}>;
export const CHAT_TASK_MIME = 'application/x-verdant-task';
export type ChatTaskDrag = Readonly<{ version: 1; source: 'workspace' | 'history'; taskId: string }>;
type TaskSource = ChatTaskDrag['source'];
const STAGES: readonly Stage[] = ['To study', 'In progress', 'Practicing', 'Completed'];
const MAX_CARDS = 1000, MAX_DRAG_TEXT = 1024;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length <= limit;
const identity = (value: unknown): value is string => string(value, 200) && value.length > 0 && !/[\u0000-\u0020\u007f]/.test(value);
const finite = (value: unknown, max = 1_000_000_000): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const calendarDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
function date(value: unknown, completed = false): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (!string(value, 64)) return undefined;
  if (calendarDate(value)) return value;
  return completed && /^\d{4}-\d{2}-\d{2}T/.test(value) && calendarDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value)) ? value : undefined;
}

/** Parse only an explicit task record. Estimates never become elapsed time. */
function card(value: unknown, kind: ChatTaskSnapshot['kind']): ChatTaskCard | null {
  if (!record(value) || !string(value.title, 2000) || !value.title.trim()) return null;
  if (value.id !== undefined && !identity(value.id)) return null;
  if (value.subject !== undefined && !string(value.subject, 1000)) return null;
  if (value.stage !== undefined && value.stage !== null && !string(value.stage, 80)) return null;
  if (value.done !== undefined && typeof value.done !== 'boolean') return null;
  if (value.notes !== undefined && !string(value.notes, 100_000)) return null;
  const due = date(value.due), completedDate = date(value.completedDate ?? value.completedAt, true);
  if (due === undefined || completedDate === undefined) return null;
  const planned = Object.hasOwn(value, 'plannedMinutes') ? value.plannedMinutes : value.duration ?? null, measured = value.measuredSeconds ?? null;
  if (planned !== null && !finite(planned, 1_000_000) || measured !== null && !finite(measured)) return null;
  if (value.priority !== undefined && value.priority !== null && (!Number.isInteger(value.priority) || Number(value.priority) < 1 || Number(value.priority) > 4)) return null;
  const labels = value.labels ?? [], subtasks = value.subtasks ?? [];
  if (!Array.isArray(labels) || labels.length > 500 || labels.some(label => !string(label, 1000))) return null;
  if (!Array.isArray(subtasks) || subtasks.length > 500 || subtasks.some(item => !record(item) || !string(item.title, 2000) || typeof item.done !== 'boolean')) return null;
  const done = value.done === true || value.stage === 'Completed' || kind === 'history';
  const stage = STAGES.includes(value.stage as Stage) ? value.stage as Stage : done ? 'Completed' : null;
  return Object.freeze({
    ...(typeof value.id === 'string' ? { id: value.id } : {}), title: value.title,
    subject: typeof value.subject === 'string' && value.subject.trim() ? value.subject : 'Unassigned', stage, done, due, completedDate,
    plannedMinutes: planned as number | null, measuredSeconds: measured as number | null, priority: value.priority === undefined || value.priority === null ? null : value.priority as number,
    notes: typeof value.notes === 'string' ? value.notes : '', labels: Object.freeze([...labels] as string[]),
    subtasks: Object.freeze(subtasks.map(item => Object.freeze({ title: item.title as string, done: item.done as boolean }))),
  });
}

function snapshot(value: unknown, id: string, label: string, expected?: ChatTaskSnapshot['kind']): ChatTaskSnapshot | null {
  if (!record(value)) return null;
  const keys = ['tasks', 'completedTasks', 'task'].filter(key => Object.hasOwn(value, key));
  if (keys.length !== 1) return null;
  const key = keys[0], kind = key === 'completedTasks' ? 'history' : key === 'tasks' ? 'daily' : 'task';
  if (expected && expected !== kind) return null;
  const rows = key === 'task' ? [value.task] : value[key];
  if (!Array.isArray(rows) || rows.length > MAX_CARDS) return null;
  const tasks = rows.map(item => card(item, kind));
  if (tasks.some(item => item === null)) return null;
  const asOf = value.asOf === undefined ? undefined : date(value.asOf);
  if (asOf === undefined && value.asOf !== undefined || asOf === null && value.asOf !== undefined) return null;
  for (const field of ['recordedStudyStreakDays', 'completedToday']) if (value[field] !== undefined && (!finite(value[field]) || !Number.isInteger(value[field]))) return null;
  return Object.freeze({ id, label, kind, tasks: Object.freeze(tasks as ChatTaskCard[]), ...(typeof asOf === 'string' ? { asOf } : {}),
    ...(typeof value.recordedStudyStreakDays === 'number' ? { recordedStudyStreakDays: value.recordedStudyStreakDays } : {}),
    ...(typeof value.completedToday === 'number' ? { completedToday: value.completedToday } : {}) });
}

/** Old snapshots without IDs remain displayable. A card is never a write command. */
export function parseChatTaskSnapshot(context: ChatContextSnapshot): ChatTaskSnapshot | null {
  if (!context || !string(context.id, 220) || !string(context.label, 100) || !string(context.text, MAX_ATTACHMENT_TEXT)) return null;
  const kind = context.id === 'daily' ? 'daily' : context.id === 'history' ? 'history' : context.id.startsWith('task:') && identity(context.id.slice(5)) ? 'task' : null;
  if (!kind) return null;
  try {
    let value: unknown = JSON.parse(context.text);
    // The first explicit-task snapshots may contain the task record directly.
    if (kind === 'task' && record(value) && typeof value.title === 'string' && !Object.hasOwn(value, 'task')) value = { task: value };
    const parsed = snapshot(value, context.id, context.label, kind);
    if (parsed?.kind === 'task' && parsed.tasks[0]?.id && parsed.tasks[0].id !== context.id.slice(5)) return null;
    return parsed;
  } catch { return null; }
}

export function taskToChatCard(task: Task | TaskHistoryEntry, subjects: readonly Subject[]): ChatTaskCard {
  const value = card({ ...task, subject: 'subjectName' in task && typeof task.subjectName === 'string' && task.subjectName || subjects.find(subject => subject.id === task.subject)?.name || task.subject || 'Unassigned', plannedMinutes: task.duration, completedDate: task.completedAt ?? null }, task.done ? 'history' : 'task');
  if (!value || !value.id) throw new Error('This saved task cannot be displayed as a card.');
  return value;
}

export function taskCardToContext(task: ChatTaskCard): ChatContextSnapshot {
  const checked = card(task, 'task');
  if (!checked?.id) throw new Error('Choose a saved task before attaching it to chat.');
  const text = JSON.stringify({ task: checked }, null, 2);
  if (text.length > MAX_ATTACHMENT_TEXT) throw new Error('This task is too large to attach. Nothing was truncated.');
  return { id: `task:${checked.id}`, label: checked.title.length > 100 ? `${checked.title.slice(0, 99)}…` : checked.title, text };
}

function drag(value: unknown): ChatTaskDrag | null {
  if (!record(value) || Object.keys(value).length !== 3 || Object.keys(value).some(key => !['version', 'source', 'taskId'].includes(key)) || value.version !== 1 || !['workspace', 'history'].includes(value.source as string) || !identity(value.taskId)) return null;
  return Object.freeze({ version: 1, source: value.source as TaskSource, taskId: value.taskId });
}
export function serializeChatTaskDrag(task: Pick<Task, 'id'>, source: TaskSource): string {
  const checked = drag({ version: 1, source, taskId: task.id });
  if (!checked) throw new Error('Only a saved Verdant task can be dragged.');
  return JSON.stringify(checked);
}
export function parseChatTaskDrag(raw: string): ChatTaskDrag | null {
  if (!string(raw, MAX_DRAG_TEXT) || !raw) return null;
  try { return drag(JSON.parse(raw)); } catch { return null; }
}
export function writeChatTaskDrag(transfer: Pick<DataTransfer, 'setData' | 'effectAllowed'>, task: Task | TaskHistoryEntry, source: TaskSource, subjects: readonly Subject[] = []): void {
  const payload = serializeChatTaskDrag(task, source), view = taskToChatCard(task, subjects);
  const oneLine = (value: string) => value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  transfer.setData(CHAT_TASK_MIME, payload);
  transfer.setData('text/plain', [`Verdant task: ${oneLine(view.title)}`, `Subject: ${oneLine(view.subject)}`, `Status: ${view.stage || (view.done ? 'Completed' : 'Not recorded')}`, ...(view.due ? [`Due: ${view.due}`] : []), ...(view.completedDate ? [`Completed: ${view.completedDate}`] : [])].join('\n'));
  transfer.effectAllowed = 'copyMove';
}
export function readChatTaskDrag(transfer: Pick<DataTransfer, 'getData'>): ChatTaskDrag | null {
  try { return parseChatTaskDrag(transfer.getData(CHAT_TASK_MIME)); } catch { return null; }
}

/** Re-read identity from the store. No dragged title, notes, status, or snapshot
 * can update a task, and a removed/reopened record does not revive itself. */
export function resolveChatTaskDrag(payload: ChatTaskDrag, workspace: Pick<State, 'tasks' | 'taskHistory'>): { task: Task | TaskHistoryEntry; source: TaskSource } | null {
  const checked = drag(payload);
  if (!checked) return null;
  const task = checked.source === 'workspace' ? workspace.tasks.find(task => task.id === checked.taskId)
    : workspace.taskHistory.find(task => task.id === checked.taskId) || workspace.tasks.find(task => task.id === checked.taskId && task.done);
  return task ? { task, source: checked.source } : null;
}

/** Older shared snapshots omitted IDs. Enable an action only when their exact
 * title, subject and completion state identify one actual saved record. A
 * displayed snapshot never acquires an invented ID or overwrites saved fields. */
export function resolveChatTaskCardIdentity(view: ChatTaskCard, workspace: Pick<State, 'tasks' | 'taskHistory' | 'subjects'>): ChatTaskDrag | null {
  const records = [...workspace.tasks, ...workspace.taskHistory];
  if (view.id !== undefined && !identity(view.id)) return null;
  const matches = view.id !== undefined ? records.filter(task => task.id === view.id) : records.filter(task => {
    if (task.title !== view.title || task.done !== view.done) return false;
    try { return taskToChatCard(task, workspace.subjects).subject === view.subject; } catch { return false; }
  });
  if (matches.length !== 1 || records.filter(task => task.id === matches[0].id).length !== 1) return null;
  const task = matches[0];
  if (!identity(task.id)) return null;
  // A malformed legacy record must not crash card rendering or gain an action.
  try { taskToChatCard(task, workspace.subjects); } catch { return null; }
  return Object.freeze({ version: 1, source: workspace.tasks.includes(task) ? 'workspace' : 'history', taskId: task.id });
}

function extractObject(text: string, index: number): { snapshot: ChatTaskSnapshot; remainder: string } | null {
  if (text.length > MAX_ATTACHMENT_TEXT) return null;
  try {
    const value: unknown = JSON.parse(text);
    const parsed = snapshot(value, `message-tasks-${index}`, 'Shared tasks');
    if (!parsed || !record(value)) return null;
    const label = parsed.kind === 'history' ? 'Completed tasks' : parsed.kind === 'daily' ? 'Tasks' : 'Task';
    const remainder = { ...value };
    delete remainder.tasks; delete remainder.completedTasks; delete remainder.task;
    delete remainder.asOf; delete remainder.recordedStudyStreakDays; delete remainder.completedToday;
    return { snapshot: Object.freeze({ ...parsed, label }), remainder: Object.keys(remainder).length ? `\`\`\`json\n${JSON.stringify(remainder, null, 2)}\n\`\`\`` : '' };
  } catch { return null; }
}

/** Recognize whole JSON or explicit JSON fences only. Ordinary code, malformed
 * data, and prose are returned byte-for-byte; no tasks are inferred from text. */
export function extractTaskCardsFromMessageContent(content: string): { text: string; snapshots: readonly ChatTaskSnapshot[] } {
  if (!string(content, MAX_CHAT_CONTEXT)) return { text: content, snapshots: [] };
  const whole = content.trim().startsWith('{') && content.trim().endsWith('}') ? extractObject(content.trim(), 0) : null;
  if (whole) return { text: whole.remainder, snapshots: Object.freeze([whole.snapshot]) };
  const lines = content.match(/[^\n]*\n|[^\n]+$/g) || [], output: string[] = [], snapshots: ChatTaskSnapshot[] = [];
  for (let index = 0; index < lines.length; index++) {
    const open = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(lines[index]);
    if (!open) { output.push(lines[index]); continue; }
    const character = open[1][0], minimum = open[1].length, language = open[2].trim().toLowerCase();
    let end = index + 1;
    const closing = new RegExp(`^ {0,3}${character === '`' ? '`' : '~'}{${minimum},}[ \\t]*\\r?\\n?$`);
    while (end < lines.length && !closing.test(lines[end])) end++;
    if (end === lines.length || language && language !== 'json') { output.push(...lines.slice(index, Math.min(end + 1, lines.length))); index = Math.min(end, lines.length - 1); continue; }
    const extracted = extractObject(lines.slice(index + 1, end).join(''), snapshots.length);
    if (extracted) { snapshots.push(extracted.snapshot); if (extracted.remainder) output.push(extracted.remainder + (lines[end].endsWith('\n') ? '\n' : '')); }
    else output.push(...lines.slice(index, end + 1));
    index = end;
  }
  return { text: output.join(''), snapshots: Object.freeze(snapshots) };
}
