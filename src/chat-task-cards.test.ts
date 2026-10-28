import { describe, expect, it } from 'vitest';
import { CHAT_TASK_MIME, extractTaskCardsFromMessageContent, parseChatTaskDrag, parseChatTaskSnapshot, readChatTaskDrag, resolveChatTaskCardIdentity, resolveChatTaskDrag, serializeChatTaskDrag, taskCardToContext, taskToChatCard, writeChatTaskDrag } from './chat-task-cards';
import type { ChatTaskCard, ChatTaskDrag } from './chat-task-cards';
import { createEmptyState } from './model';
import type { Subject, Task, TaskHistoryEntry } from './model';

// Test-only records exercise existing user-record formats; no live seed content.
const subjects: Subject[] = [{ id: 'subject-1', name: 'Saved subject', color: 'purple' }];
const task = (patch: Partial<Task> = {}): Task => ({ id: 'task-1', title: 'Review my uploaded notes', subject: 'subject-1', stage: 'In progress', done: false, due: '2026-10-28', duration: 25, priority: 2, notes: 'My own note', labels: ['revision'], subtasks: [{ id: 's1', title: 'Read saved section', done: true }], ...patch });
const context = (id: string, value: unknown) => ({ id, label: id === 'daily' ? 'Daily Tracker' : 'History', text: JSON.stringify(value) });

describe('read-only task cards from saved chat context', () => {
  it('reads legacy connector snapshots without IDs or invented elapsed time', () => {
    const daily = parseChatTaskSnapshot(context('daily', { asOf: '2026-10-28', recordedStudyStreakDays: 3, completedToday: 1, tasks: [{ title: 'Saved legacy task', subject: 'Maths', stage: 'Practicing', due: null, plannedMinutes: 25, notes: '', labels: [], subtasks: [] }] }));
    expect(daily).toMatchObject({ kind: 'daily', asOf: '2026-10-28', recordedStudyStreakDays: 3, completedToday: 1 });
    expect(daily?.tasks[0]).toMatchObject({ title: 'Saved legacy task', stage: 'Practicing', plannedMinutes: 25, measuredSeconds: null, done: false, due: null });
    expect(daily?.tasks[0].id).toBeUndefined();
    const history = parseChatTaskSnapshot(context('history', { completedTasks: [{ title: 'Archived legacy task', completedDate: '2026-10-27', plannedMinutes: 60, measuredSeconds: null }] }));
    expect(history?.tasks[0]).toMatchObject({ stage: 'Completed', done: true, completedDate: '2026-10-27', plannedMinutes: 60, measuredSeconds: null, subject: 'Unassigned' });
    expect(parseChatTaskSnapshot(context('daily', { tasks: [] }))?.tasks).toEqual([]);
  });
  it('preserves actual task detail and historical subject names in immutable cards', () => {
    const original: TaskHistoryEntry = { ...task({ stage: 'Completed', done: true, completedAt: '2026-10-27T10:30:00.000Z', measuredSeconds: 91.5 }), archivedAt: '2026-10-27T11:00:00.000Z', subjectName: 'Subject before rename' };
    const view = taskToChatCard(original, subjects);
    expect(view).toMatchObject({ id: original.id, subject: 'Subject before rename', notes: 'My own note', due: '2026-10-28', completedDate: original.completedAt, plannedMinutes: 25, measuredSeconds: 91.5, priority: 2, labels: ['revision'], subtasks: [{ title: 'Read saved section', done: true }] });
    expect(Object.isFrozen(view)).toBe(true); expect(Object.isFrozen(view.labels)).toBe(true); expect(Object.isFrozen(view.subtasks[0])).toBe(true);
    expect(original.subtasks[0]).toEqual({ id: 's1', title: 'Read saved section', done: true });
  });
  it('round-trips explicit saved tasks within the existing context format and label limit', () => {
    const view = taskToChatCard(task({ title: 'Long supplied title '.repeat(12) }), subjects), saved = taskCardToContext(view);
    expect(saved.id).toBe('task:task-1'); expect(saved.label.length).toBe(100);
    expect(parseChatTaskSnapshot(saved)?.tasks).toEqual([view]);
    expect(() => taskCardToContext({ ...view, id: undefined })).toThrow('saved task');
    expect(parseChatTaskSnapshot(context('task:task-1', { task: { ...view, id: 'different' } }))).toBeNull();
    expect(parseChatTaskSnapshot(context('task:task-1', task({})))?.tasks[0].plannedMinutes).toBe(25);
  });
  it('rejects damaged, oversized or unrelated contexts rather than creating guessed cards', () => {
    for (const value of [{ tasks: 'not an array' }, { tasks: [{ title: '' }] }, { tasks: [{ title: 'A', measuredSeconds: -1 }] }, { tasks: [{ title: 'A', due: '2026-02-30' }] }, { tasks: [{ title: 'A', completedDate: '2026-02-30T12:00:00Z' }] }, { tasks: [{ title: 'A', subtasks: [{ title: 'Missing state' }] }] }, { tasks: [], completedTasks: [] }, { tasks: Array.from({ length: 1001 }, () => ({ title: 'A' })) }]) expect(parseChatTaskSnapshot(context('daily', value))).toBeNull();
    expect(parseChatTaskSnapshot({ id: 'daily', label: 'Daily', text: '{broken' })).toBeNull();
    expect(parseChatTaskSnapshot({ id: 'daily', label: 'Daily', text: 'x'.repeat(120001) })).toBeNull();
    expect(parseChatTaskSnapshot(context('mistakes', { tasks: [{ title: 'Not selected as tasks' }] }))).toBeNull();
    expect(parseChatTaskSnapshot(context('daily', { tasks: [{ title: 'Unknown plan', plannedMinutes: null, duration: 25 }] }))?.tasks[0].plannedMinutes).toBeNull();
  });
});

describe('explicit task JSON in existing message content', () => {
  it('extracts completed task cards while preserving surrounding prose and non-task fields', () => {
    const input = 'Your recorded work:\n```json\n' + JSON.stringify({ completedTasks: [{ title: 'Read existing notes', completedDate: '2026-10-27', measuredSeconds: null }], note: 'No elapsed time supplied' }) + '\n```\nChoose the next step.';
    const parsed = extractTaskCardsFromMessageContent(input);
    expect(parsed.snapshots).toHaveLength(1); expect(parsed.snapshots[0]).toMatchObject({ kind: 'history', label: 'Completed tasks' });
    expect(parsed.snapshots[0].tasks[0]).toMatchObject({ title: 'Read existing notes', measuredSeconds: null, done: true });
    expect(parsed.text).toContain('Your recorded work:'); expect(parsed.text).toContain('Choose the next step.'); expect(parsed.text).toContain('No elapsed time supplied'); expect(parsed.text).not.toContain('Read existing notes');
  });
  it('handles whole JSON and multiple JSON fences without treating their titles as saved identities', () => {
    const whole = extractTaskCardsFromMessageContent(JSON.stringify({ task: { title: 'Legacy card', notes: 'Saved message detail' } }));
    expect(whole.text).toBe(''); expect(whole.snapshots[0].tasks[0].id).toBeUndefined();
    const result = extractTaskCardsFromMessageContent('```json\n{"tasks":[{"title":"First"}]}\n```\nThen\n~~~JSON\n{"completedTasks":[{"title":"Second"}]}\n~~~');
    expect(result.snapshots.map(item => item.id)).toEqual(['message-tasks-0', 'message-tasks-1']);
    expect(result.snapshots.map(item => item.tasks[0].title)).toEqual(['First', 'Second']); expect(result.text).toContain('Then');
  });
  it('leaves normal programming examples, malformed JSON, nested fences and prose unchanged', () => {
    const samples = [
      'Completed task: solve the equations. No JSON is attached.',
      'Example {"tasks":[{"title":"Inline code"}]} follows.',
      '```js\nconst tasks = [{title:"Example code"}];\n```',
      '```json\n{"title":"An ordinary object","answer":42}\n```',
      '```json\n{"tasks":[{"title":"Broken"}]\n```',
      '````markdown\n```json\n{"tasks":[{"title":"Nested example"}]}\n```\n````',
    ];
    for (const content of samples) expect(extractTaskCardsFromMessageContent(content)).toEqual({ text: content, snapshots: [] });
  });
  it('does not discard other recorded results when the same JSON includes task cards', () => {
    const result = extractTaskCardsFromMessageContent(JSON.stringify({ completedTasks: [{ title: 'Actual supplied task' }], testResults: [{ score: 12, maximum: 20 }], focusLog: [{ date: '2026-10-27', minutes: 15 }] }));
    expect(result.snapshots).toHaveLength(1); expect(result.text).toContain('testResults'); expect(result.text).toContain('focusLog'); expect(result.text).not.toContain('Actual supplied task');
  });
});

describe('native task drag identity and saved-record resolution', () => {
  it('enables legacy cards only for a unique saved title, subject and completion match', () => {
    const saved = task(), state = { ...createEmptyState(), subjects, tasks: [saved] }, legacy = { ...taskToChatCard(saved, subjects), id: undefined };
    expect(resolveChatTaskCardIdentity(legacy, state)).toEqual({ version: 1, source: 'workspace', taskId: saved.id });
    expect(legacy.id).toBeUndefined();
    expect(resolveChatTaskCardIdentity({ ...legacy, title: 'Missing' }, state)).toBeNull();
    expect(resolveChatTaskCardIdentity({ ...legacy, subject: 'Different subject' }, state)).toBeNull();
    expect(resolveChatTaskCardIdentity({ ...legacy, done: true }, state)).toBeNull();
    expect(resolveChatTaskCardIdentity(legacy, { ...state, tasks: [saved, task({ id: 'same-title' })] })).toBeNull();
  });
  it('resolves renamed explicit IDs while rejecting duplicate and deleted saved identities', () => {
    const saved = task(), state = { ...createEmptyState(), subjects, tasks: [saved] }, older = { ...taskToChatCard(saved, subjects), title: 'Earlier title', subject: 'Earlier subject name' };
    expect(resolveChatTaskCardIdentity(older, state)).toEqual({ version: 1, source: 'workspace', taskId: saved.id });
    expect(resolveChatTaskCardIdentity(older, { ...state, tasks: [] })).toBeNull();
    const archived = { ...saved, stage: 'Completed' as const, done: true, archivedAt: '2026-10-27T12:00:00Z' };
    expect(resolveChatTaskCardIdentity(older, { ...state, taskHistory: [archived] })).toBeNull();
    const historical = { ...taskToChatCard(archived, subjects), id: undefined };
    expect(resolveChatTaskCardIdentity(historical, { ...state, tasks: [], taskHistory: [archived] })).toEqual({ version: 1, source: 'history', taskId: archived.id });
    expect(resolveChatTaskCardIdentity({ ...older, id: 'invalid id' }, state)).toBeNull();
  });
  it('writes a bounded identity payload and meaningful plain text without serializing private task fields', () => {
    const values = new Map<string, string>(), transfer = { effectAllowed: 'none' as DataTransfer['effectAllowed'], setData: (kind: string, value: string) => { values.set(kind, value); } };
    writeChatTaskDrag(transfer, task({ title: 'My task\nwith a second line', notes: 'Private long note excluded from the drag payload' }), 'workspace', subjects);
    expect(values.get(CHAT_TASK_MIME)).toBe('{"version":1,"source":"workspace","taskId":"task-1"}');
    expect(values.get('text/plain')).toContain('Verdant task: My task with a second line'); expect(values.get('text/plain')).toContain('Subject: Saved subject');
    expect(values.get('text/plain')).not.toContain('Private long note'); expect(transfer.effectAllowed).toBe('copyMove');
    expect(readChatTaskDrag({ getData: kind => values.get(kind) || '' })).toEqual({ version: 1, source: 'workspace', taskId: 'task-1' });
    expect(readChatTaskDrag({ getData: () => { throw new Error('Protected drag data'); } })).toBeNull();
  });
  it('rejects unrecognized sources, versions, invalid IDs, extra snapshots and oversized drag text', () => {
    const payload = { version: 1, source: 'workspace', taskId: 'task-1' };
    for (const value of [{ ...payload, source: 'external' }, { ...payload, version: 2 }, { ...payload, taskId: '' }, { ...payload, taskId: 'bad\nid' }, { ...payload, taskId: 'x'.repeat(201) }, { ...payload, snapshot: { title: 'Injected task' } }, [], null]) expect(parseChatTaskDrag(JSON.stringify(value))).toBeNull();
    expect(parseChatTaskDrag('x'.repeat(1025))).toBeNull(); expect(parseChatTaskDrag('Verdant task: text is not an identity')).toBeNull();
    expect(() => serializeChatTaskDrag({ id: 'bad id' }, 'workspace')).toThrow('saved Verdant task');
  });
  it('uses the current saved record and refuses a removed, archived or reopened source identity', () => {
    const state = createEmptyState(), active = task(), recent = task({ id: 'recent', done: true, stage: 'Completed' }), archived: TaskHistoryEntry = { ...task({ id: 'archived', done: true, stage: 'Completed' }), archivedAt: '2026-10-27T12:00:00Z' };
    state.tasks = [active, recent]; state.taskHistory = [archived];
    const payload = (taskId: string, source: 'workspace' | 'history'): ChatTaskDrag => ({ version: 1, source, taskId });
    expect(resolveChatTaskDrag(payload(active.id, 'workspace'), state)?.task).toBe(active);
    expect(resolveChatTaskDrag(payload(recent.id, 'history'), state)?.task).toBe(recent);
    expect(resolveChatTaskDrag(payload(archived.id, 'history'), state)?.task).toBe(archived);
    expect(resolveChatTaskDrag(payload(archived.id, 'workspace'), state)).toBeNull(); expect(resolveChatTaskDrag(payload(active.id, 'history'), state)).toBeNull();
    expect(resolveChatTaskDrag(payload('removed', 'workspace'), state)).toBeNull();
    expect(resolveChatTaskDrag({ ...payload(active.id, 'workspace'), title: 'Injected' } as ChatTaskDrag, state)).toBeNull();
    expect(state.tasks[0].title).toBe('Review my uploaded notes'); expect(state.taskHistory[0]).toBe(archived);
  });
});
