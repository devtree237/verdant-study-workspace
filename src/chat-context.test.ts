import { describe, expect, it } from 'vitest';
import { buildWorkspaceContexts, groupChatHistory } from './chat-context';
import { messageText, validateChatHistory } from './chat-api';
import { createEmptyState } from './model';
import type { Task } from './model';
import type { Conversation } from './chat-api';
import { answerQuestion, createAttempt, submitAttempt } from './testing-model';
import type { TestPaper } from './testing-model';

const task = (id: string, patch: Partial<Task> = {}): Task => ({ id, title: 'Study supplied notes', subject: 'maths', priority: 2, due: '2026-10-26', duration: 25, labels: [], stage: 'To study', done: false, notes: '', subtasks: [], ...patch });
describe('explicit Study Chat context', () => {
  it('shares no workspace data or documents without a selected connector', () => {
    const workspace = createEmptyState(); workspace.tasks = [task('private')];
    expect(buildWorkspaceContexts({ selected: [], workspace, documents: [{ id: 'private', title: 'Private file', text: 'Do not share', pages: 1 }] })).toEqual([]);
  });
  it('includes logged mistakes and exactly the selected document text, with no unrelated task data', () => {
    const workspace = createEmptyState(); workspace.tasks = [task('unselected')]; workspace.resources = [{ id: 'secret', title: 'Unselected material', content: 'Never read this', subject: '', folder: '', type: 'Note', mastery: 0, pinned: false, updated: '' }];
    const snapshots = buildWorkspaceContexts({ selected: ['mistakes'], workspace, documents: [{ id: 'selected', title: 'Chosen notes', text: 'Explicitly selected words', pages: 2 }] });
    expect(snapshots).toHaveLength(1); expect(snapshots[0].text).toContain('Explicitly selected words'); expect(snapshots[0].text).not.toContain('Never read this'); expect(snapshots[0].text).not.toContain('Study supplied notes');
  });
  it('uses today/active task records and archived completion dates for streaks without fabricating elapsed time', () => {
    const workspace = createEmptyState(); workspace.tasks = [task('today'), task('active', { due: '2026-11-01', stage: 'Practicing' }), task('later', { title: 'Unselected future work', due: '2026-11-01' })];
    const completed = [task('done1', { done: true, stage: 'Completed', completedAt: '2026-10-26T03:00:00.000Z' }), task('done2', { done: true, stage: 'Completed', completedAt: '2026-10-25' })];
    const data = JSON.parse(buildWorkspaceContexts({ selected: ['daily'], workspace, completedTasks: completed, now: new Date('2026-10-26T12:00:00') })[0].text);
    expect(data.recordedStudyStreakDays).toBe(2); expect(data.completedToday).toBe(1); expect(data.tasks).toHaveLength(2); expect(JSON.stringify(data)).not.toContain('Unselected future work'); expect(data.tasks[0].plannedMinutes).toBe(25); expect(data.tasks[0].measuredSeconds).toBeUndefined();
  });
  it('deduplicates live and archived completed work and keeps unknown measured time null', () => {
    const workspace = createEmptyState(); workspace.tasks = [task('done', { done: true, completedAt: '2026-10-26' })];
    const result = JSON.parse(buildWorkspaceContexts({ selected: ['history'], workspace, completedTasks: [task('done', { done: true, completedAt: '2026-10-26', measuredSeconds: 90 }), { ...task('old', { done: true }), subjectName: 'Archived subject' }] })[0].text);
    expect(result.completedTasks).toHaveLength(2); expect(result.completedTasks[0].measuredSeconds).toBe(90); expect(result.completedTasks[1].measuredSeconds).toBeNull(); expect(result.completedTasks[1].completedDate).toBeNull(); expect(result.completedTasks[1].subject).toBe('Archived subject');
  });
  it('fails visibly when selected context is too large rather than sending a partial snapshot', () => {
    expect(() => buildWorkspaceContexts({ selected: ['mistakes'], workspace: createEmptyState(), documents: [{ id: 'large', title: 'Large', text: 'x'.repeat(120_001), pages: 1 }] })).toThrow('nothing was truncated');
  });
  it('uses recorded submitted test scores only when History is explicitly selected', () => {
    const paper: TestPaper = { id: 'paper', title: 'Supplied paper', description: '', durationMinutes: 2, createdAt: 1, updatedAt: 1, questions: [{ id: 'q', prompt: 'Supplied prompt', subject: 'Maths', chapter: '', topic: '', difficulty: 'Easy', kind: 'single', options: ['One', 'Two'], correctAnswers: [1], marks: 4, negativeMarks: 1, idealSeconds: 30, explanation: '' }] };
    const running = createAttempt(paper, 1_000), submitted = submitAttempt(answerQuestion(running, 'q', [1], 11_000), 21_000);
    const data = JSON.parse(buildWorkspaceContexts({ selected: ['history'], workspace: createEmptyState(), attempts: [running, submitted] })[0].text);
    expect(data.testResults).toHaveLength(1); expect(data.testResults[0]).toMatchObject({ title: 'Supplied paper', score: 4, maximum: 4, correct: 1 });
    expect(JSON.stringify(buildWorkspaceContexts({ selected: ['daily'], workspace: createEmptyState(), attempts: [submitted] }))).not.toContain('Supplied paper');
  });
  it('serializes explicit snapshots with a message and round-trips old and new chat histories', () => {
    const contexts = [{ id: 'daily', label: 'Daily Tracker', text: '{"tasks":[]}' }];
    const chat: Conversation = { id: 'chat', title: 'My study', subject: 'maths', createdAt: 1, updatedAt: 2, messages: [{ id: 'm', role: 'user', content: 'Plan my session', createdAt: 1, contexts }] };
    expect(messageText(chat.messages[0])).toContain('User-selected workspace context: Daily Tracker');
    expect(validateChatHistory({ version: 1, conversations: [chat] })).toEqual([chat]);
    const legacy = { ...chat, subject: undefined, messages: [{ id: 'm', role: 'user', content: 'Hello', createdAt: 1 }] };
    expect(validateChatHistory({ version: 1, conversations: [legacy] })[0].messages[0].contexts).toBeUndefined();
    expect(messageText(legacy.messages[0])).toBe('Hello');
  });
  it('rejects duplicate or malformed stored context rather than silently changing it', () => {
    const message = { id: 'm', role: 'user', content: 'Hi', createdAt: 1, contexts: [{ id: 'daily', label: 'Daily Tracker', text: 'Data' }, { id: 'daily', label: 'Daily Tracker', text: 'Other' }] };
    expect(() => validateChatHistory({ version: 1, conversations: [{ id: 'c', title: 'Chat', messages: [message], createdAt: 1, updatedAt: 1 }] })).toThrow('workspace context');
  });
  it('round-trips three connectors and twenty explicitly attached task cards', () => {
    const contexts = ['daily','history','mistakes',...Array.from({length:20},(_,index)=>`task:selected-${index}`)].map(id=>({id,label:id,text:'Selected snapshot'}));
    const history = (rows:typeof contexts) => ({version:1,conversations:[{id:'chat',title:'Selected work',createdAt:1,updatedAt:1,messages:[{id:'message',role:'user',content:'Review these tasks',createdAt:1,contexts:rows}]}]});
    expect(validateChatHistory(history(contexts))[0].messages[0].contexts).toEqual(contexts);
    expect(()=>validateChatHistory(history([...contexts,{id:'task:too-many',label:'Extra task',text:'Selected snapshot'}]))).toThrow('workspace context');
  });
  it('groups actual conversation timestamps by date without mutating saved order', () => {
    const chat = (id: string, time: string): Conversation => ({ id, title: id, messages: [], createdAt: Date.parse(time), updatedAt: Date.parse(time) });
    const chats = [chat('older', '2026-09-01T12:00:00'), chat('today', '2026-10-26T12:00:00'), chat('yesterday', '2026-10-25T12:00:00'), chat('week', '2026-10-22T12:00:00')];
    const grouped = groupChatHistory(chats, new Date('2026-10-26T15:00:00'));
    expect(grouped.map(group => [group.label, group.chats[0].id])).toEqual([['Today', 'today'], ['Yesterday', 'yesterday'], ['Previous 7 Days', 'week'], ['Older', 'older']]); expect(chats[0].id).toBe('older');
  });
});
