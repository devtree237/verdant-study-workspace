import type { Stage, State, Task } from './model';
import type { ChatTaskDrag } from './chat-task-cards';
import { resolveChatTaskDrag } from './chat-task-cards';
import { createHistoryFollowUp, moveTaskToStage } from './task-history';

export type ChatTaskBoardTarget = { stage?: Stage; priority?: number };
type Movement = Pick<Task, 'stage' | 'priority' | 'done' | 'completedAt'>;
type MovementField = keyof Movement;
export type ChatTaskBoardUndo =
 | { kind: 'move'; taskId: string; before: Movement; after: Movement; changed: MovementField[] }
 | { kind: 'follow-up'; created: Task };
export type ChatTaskBoardResult = { state: State; undo?: ChatTaskBoardUndo; newId?: string; message: string };
const movement = (task: Task): Movement => ({ stage: task.stage, priority: task.priority, done: task.done, completedAt: task.completedAt });
const cloneTask = (task: Task): Task => ({ ...task, labels: [...task.labels], subtasks: task.subtasks.map(item => ({ ...item })), ...(task.link ? { link: { ...task.link } } : {}) });

function checkedTarget(target: ChatTaskBoardTarget): ChatTaskBoardTarget {
 if (!target || typeof target !== 'object' || Array.isArray(target)) throw new Error('Choose a board column before moving this task.');
 if (target.stage === 'Completed') throw new Error('Choose To study, In progress, or Practicing. Use the task checkbox on the board to mark work complete.');
 if (target.stage !== undefined && !['To study','In progress','Practicing'].includes(target.stage)) throw new Error('This board stage is not supported.');
 if (target.priority !== undefined && (!Number.isInteger(target.priority) || target.priority < 1 || target.priority > 4)) throw new Error('Choose a priority from 1 to 4.');
 if (target.stage === undefined && target.priority === undefined) throw new Error('Choose a stage or priority column.');
 return { ...(target.stage === undefined ? {} : { stage: target.stage }), ...(target.priority === undefined ? {} : { priority: target.priority }) };
}

/** A card is an identity reference, never a task definition. Re-read the live
 * store on every action; completed records always remain untouched in History. */
export function applyChatTaskToBoard(state: State, payload: ChatTaskDrag, target: ChatTaskBoardTarget, now = Date.now()): ChatTaskBoardResult {
 const destination = checkedTarget(target), resolved = resolveChatTaskDrag(payload, state);
 if (!resolved) throw new Error('This task card is stale or its saved task was deleted. Refresh the card from the workspace or History.');
 const source = resolved.task;
 if (state.tasks.filter(task => task.id === source.id).length + state.taskHistory.filter(task => task.id === source.id).length !== 1) throw new Error('This task has duplicate saved identities. Resolve the duplicate in the workspace before using this card.');
 const completed = source.done || source.stage === 'Completed';
 if (resolved.source === 'history' && !completed || source.done !== (source.stage === 'Completed')) throw new Error('This saved task has inconsistent completion status. Open it in the workspace before moving it.');
 const label = destination.stage || `Priority ${destination.priority}`;
 if (completed) {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new Error('The follow-up date could not be read. Try again.');
  const next = createHistoryFollowUp(state, source.id, now), copy = next.tasks.find(task => !state.tasks.some(previous => previous.id === task.id));
  if (!copy || state.taskHistory.some(task => task.id === copy.id)) throw new Error('A unique follow-up could not be created. Try again.');
  const created = cloneTask({ ...copy, stage: destination.stage || 'To study', ...(destination.priority === undefined ? {} : { priority: destination.priority }) });
  return { state: { ...next, tasks: next.tasks.map(task => task.id === created.id ? created : task) }, newId: created.id, undo: { kind: 'follow-up', created: cloneTask(created) }, message: `Follow-up added to ${label}. The original completion remains in History.` };
 }
 let next = destination.stage ? moveTaskToStage(state, source.id, destination.stage, now) : state;
 if (destination.priority !== undefined) next = { ...next, tasks: next.tasks.map(task => task.id === source.id ? { ...task, priority: destination.priority! } : task) };
 const moved = next.tasks.find(task => task.id === source.id)!, before = movement(source), after = movement(moved);
 const changed = (Object.keys(before) as MovementField[]).filter(field => before[field] !== after[field]);
 if (!changed.length) return { state, message: `This task is already in ${label}.` };
 return { state: next, undo: { kind: 'move', taskId: source.id, before, after, changed }, message: `Task moved to ${label}.` };
}

/** Undo only this action. Later edits to a new follow-up or later movement of
 * an existing task are user work and are retained rather than overwritten. */
export function undoChatTaskBoardAction(state: State, undo: ChatTaskBoardUndo): State {
 if (undo.kind === 'follow-up') {
  const current = state.tasks.find(task => task.id === undo.created.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(undo.created)) return state;
  return { ...state, tasks: state.tasks.filter(task => task.id !== undo.created.id) };
 }
 const current = state.tasks.find(task => task.id === undo.taskId);
 if (!current || current.done !== undo.after.done || current.completedAt !== undo.after.completedAt || current.stage === 'Completed' || undo.changed.some(field => current[field] !== undo.after[field])) return state;
 const restore = Object.fromEntries(undo.changed.map(field => [field, undo.before[field]]));
 return { ...state, tasks: state.tasks.map(task => task.id === undo.taskId ? { ...task, ...restore } : task) };
}
