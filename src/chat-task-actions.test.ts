import { describe, expect, it } from 'vitest';
import { createEmptyState, type Task } from './model';
import { applyChatTaskToBoard, undoChatTaskBoardAction } from './chat-task-actions';
import type { ChatTaskDrag } from './chat-task-cards';

// Isolated fixtures only. The application never seeds these tasks or records.
const task = (id = 'saved', changes: Partial<Task> = {}): Task => ({ id, title: 'Read the supplied chapter', subject: 'physics', priority: 3, due: '2026-10-28', duration: 25, labels: ['revision'], stage: 'To study', done: false, notes: 'Actual saved notes', subtasks: [{ id: 'sub', title: 'Read', done: true }], link: { type: 'resource', id: 'saved-file' }, ...changes });
const payload = (source: ChatTaskDrag['source'] = 'workspace', taskId = 'saved'): ChatTaskDrag => ({ version: 1, source, taskId });
const now = Date.parse('2026-10-28T12:00:00Z');

describe('verified chat task actions', () => {
 it('moves an existing active task using its saved fields and supports a priority target', () => {
  const state = { ...createEmptyState(), tasks: [task(), task('other')] }, before = JSON.stringify(state);
  const moved = applyChatTaskToBoard(state, payload(), { stage: 'Practicing', priority: 1 }, now);
  expect(moved.state.tasks[0]).toMatchObject({ id: 'saved', title: state.tasks[0].title, notes: state.tasks[0].notes, stage: 'Practicing', priority: 1 });
  expect(moved.newId).toBeUndefined(); expect(moved.state.tasks).toHaveLength(2); expect(JSON.stringify(state)).toBe(before);
  expect(applyChatTaskToBoard(moved.state, payload(), { priority: 1 }).state).toBe(moved.state);
 });
 it('creates a separate follow-up from an archived completion while preserving its full History record', () => {
  const completed = { ...task('saved', { done: true, stage: 'Completed', measuredSeconds: 90, completedAt: '2026-10-27T12:00:00Z', recurring: true }), archivedAt: '2026-10-27T13:00:00Z' };
  const state = { ...createEmptyState(), taskHistory: [completed] }, before = JSON.stringify(state);
  const result = applyChatTaskToBoard(state, payload('history'), { stage: 'In progress', priority: 2 }, now), created = result.state.tasks[0];
  expect(created.id).toBe(result.newId); expect(created.id).not.toBe(completed.id);
  expect(created).toMatchObject({ title: completed.title, stage: 'In progress', done: false, priority: 2, recurring: false, subtasks: [{ id: 'sub', title: 'Read', done: false }] });
  expect(created.completedAt).toBeUndefined(); expect(created.measuredSeconds).toBeUndefined();
  expect(result.state.taskHistory).toBe(state.taskHistory); expect(JSON.stringify(state)).toBe(before);
  created.labels.push('later'); created.subtasks[0].done = true; created.link!.id = 'later-file';
  expect(completed.labels).toEqual(['revision']); expect(completed.link!.id).toBe('saved-file');
 });
 it('keeps a recently completed live task and creates only a new active copy for either permitted source', () => {
  const original = task('saved', { done: true, stage: 'Completed', completedAt: '2026-10-27T12:00:00Z' }), state = { ...createEmptyState(), tasks: [original] };
  for (const source of ['workspace','history'] as const) {
   const result = applyChatTaskToBoard(state, payload(source), { priority: 4 }, now);
   expect(result.state.tasks).toHaveLength(2); expect(result.state.tasks.find(item => item.id === original.id)).toBe(original);
   expect(result.state.tasks[0]).toMatchObject({ stage: 'To study', done: false, priority: 4 });
   expect(result.state.taskHistory).toBe(state.taskHistory);
  }
 });
 it('rejects arbitrary snapshots, missing IDs, stale source identities and unsupported targets', () => {
  const state = { ...createEmptyState(), tasks: [task()] }, before = JSON.stringify(state);
  for (const value of [payload('workspace','missing'), { ...payload(), title: 'Injected task' }, { version: 1, source: 'workspace' }, payload('history')]) expect(() => applyChatTaskToBoard(state, value as ChatTaskDrag, { stage: 'In progress' })).toThrow('stale');
  for (const target of [{}, { priority: 5 }, { stage: 'Completed' as const }, { stage: 'Unknown' as 'To study' }]) expect(() => applyChatTaskToBoard(state, payload(), target)).toThrow();
  expect(JSON.stringify(state)).toBe(before);
 });
 it('rejects a workspace card archived since it was dragged and duplicate saved identities', () => {
  const completed = { ...task('saved', { done: true, stage: 'Completed' }), archivedAt: '2026-10-27T13:00:00Z' };
  expect(() => applyChatTaskToBoard({ ...createEmptyState(), taskHistory: [completed] }, payload(), { stage: 'To study' })).toThrow('stale');
  expect(() => applyChatTaskToBoard({ ...createEmptyState(), tasks: [task()], taskHistory: [completed] }, payload(), { stage: 'To study' })).toThrow('duplicate');
 });
 it('Undo restores movement fields while retaining later unrelated edits and tasks', () => {
  const state = { ...createEmptyState(), tasks: [task()] }, moved = applyChatTaskToBoard(state, payload(), { stage: 'Practicing', priority: 1 });
  const later = { ...moved.state, tasks: [{ ...moved.state.tasks[0], notes: 'Later notes', title: 'Later title' }, task('later')] };
  const restored = undoChatTaskBoardAction(later, moved.undo!);
  expect(restored.tasks[0]).toMatchObject({ stage: 'To study', priority: 3, notes: 'Later notes', title: 'Later title' });
  expect(restored.tasks[1]).toBe(later.tasks[1]);
  const movedAgain = { ...later, tasks: later.tasks.map(item => item.id === 'saved' ? { ...item, stage: 'In progress' as const } : item) };
  expect(undoChatTaskBoardAction(movedAgain, moved.undo!)).toBe(movedAgain);
 });
 it('Undo removes only an unchanged new follow-up and preserves later edited or completed work', () => {
  const state = { ...createEmptyState(), tasks: [task('saved', { done: true, stage: 'Completed' })] };
  const result = applyChatTaskToBoard(state, payload(), { stage: 'To study' }, now);
  expect(undoChatTaskBoardAction(result.state, result.undo!).tasks).toEqual(state.tasks);
  const edited = { ...result.state, tasks: result.state.tasks.map(item => item.id === result.newId ? { ...item, notes: 'Later user work' } : item) };
  expect(undoChatTaskBoardAction(edited, result.undo!)).toBe(edited);
  const moved = applyChatTaskToBoard({ ...createEmptyState(), tasks: [task()] }, payload(), { priority: 2 });
  const completed = { ...moved.state, tasks: moved.state.tasks.map(item => ({ ...item, done: true, stage: 'Completed' as const, completedAt: '2026-10-28T13:00:00Z' })) };
  expect(undoChatTaskBoardAction(completed, moved.undo!)).toBe(completed);
 });
});
