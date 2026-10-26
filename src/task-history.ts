import type { State, Stage, Task, TaskHistoryEntry } from './model';
export type { TaskHistoryEntry } from './model';
export const COMPLETED_CAPACITY = 4;
const timestamp = (value?: string) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

export function measuredTaskSeconds(task: Task, now = Date.now()): number | undefined {
 const measured = typeof task.measuredSeconds === 'number' && Number.isFinite(task.measuredSeconds) && task.measuredSeconds >= 0 ? task.measuredSeconds : undefined;
 const started = timestamp(task.trackingStartedAt);
 return started ? Math.max(0, measured || 0) + Math.max(0, Math.floor((now-started)/1000)) : measured;
}
export function stopTaskClock(task: Task, now = Date.now()): Task {
 if(!task.trackingStartedAt)return task;
 return {...task,measuredSeconds:measuredTaskSeconds(task,now),trackingStartedAt:undefined};
}
/** Overflow moves into immutable full task snapshots; missing legacy times remain unknown. */
export function archiveCompletedTasks(state: State, now = Date.now()): State {
 const completed=state.tasks.filter(task=>task.done||task.stage==='Completed').sort((a,b)=>timestamp(b.completedAt)-timestamp(a.completedAt));
 if(completed.length<=COMPLETED_CAPACITY)return state;
 const overflow=completed.slice(COMPLETED_CAPACITY), ids=new Set(overflow.map(task=>task.id)), existing=new Map((state.taskHistory||[]).map(task=>[task.id,task]));
 for(const task of overflow){const subject=state.subjects.find(item=>item.id===task.subject);if(!existing.has(task.id))existing.set(task.id,{...stopTaskClock(task,now),done:true,stage:'Completed',archivedAt:new Date(now).toISOString(),...(subject?{subjectName:subject.name,subjectColor:subject.color}:{})});}
 return {...state,tasks:state.tasks.filter(task=>!ids.has(task.id)),taskHistory:[...existing.values()].sort((a,b)=>timestamp(b.completedAt)-timestamp(a.completedAt))};
}
export function getTaskHistoryRecords(state: Pick<State,'tasks'|'taskHistory'>): TaskHistoryEntry[] {
 const records=new Map((state.taskHistory||[]).map(task=>[task.id,task]));
 // Recent completed cards are history too; they have not needed archiving yet.
 for(const task of state.tasks.filter(task=>task.done))if(!records.has(task.id))records.set(task.id,{...task,archivedAt:''});
 return [...records.values()].sort((a,b)=>timestamp(b.completedAt)-timestamp(a.completedAt));
}
export function getArchivedTaskCount(state: Pick<State,'taskHistory'>) {return state.taskHistory?.length||0;}
export function taskCompletionDay(task: Task): string {
 if(!task.completedAt)return 'unknown';
 if(/^\d{4}-\d{2}-\d{2}$/.test(task.completedAt)){const parsed=new Date(task.completedAt+'T12:00:00');return Number.isFinite(parsed.getTime())&&localDate(parsed)===task.completedAt?task.completedAt:'unknown';}
 const date=new Date(task.completedAt);return Number.isFinite(date.getTime())?localDate(date):'unknown';
}
export type CompletionUndo = { original: Task; recurrence?: Task; completedAt: string; archived:TaskHistoryEntry[] };
export function completeTask(state: State, id: string, now = Date.now()): {state: State; undo?: CompletionUndo} {
 const original=state.tasks.find(task=>task.id===id);if(!original||original.done)return {state};
 const completedAt=new Date(now).toISOString(), completed={...stopTaskClock(original,now),done:true,stage:'Completed' as Stage,completedAt};
 const tomorrow=new Date(now);tomorrow.setDate(tomorrow.getDate()+1);
 const recurrence=original.recurring?{...original,id:crypto.randomUUID(),due:localDate(tomorrow),stage:'To study' as Stage,done:false,completedAt:undefined,measuredSeconds:undefined,trackingStartedAt:undefined,subtasks:original.subtasks.map(item=>({...item,done:false}))}:undefined;
 const next={...state,tasks:[completed,...state.tasks.filter(task=>task.id!==id),...(recurrence?[recurrence]:[])]};
 const finished=archiveCompletedTasks(next,now),previousIds=new Set(state.taskHistory.map(task=>task.id));
 return {state:finished,undo:{original,recurrence,completedAt,archived:finished.taskHistory.filter(task=>!previousIds.has(task.id))}};
}
export function undoTaskCompletion(state: State, undo: CompletionUndo): State {
 const current=state.tasks.find(task=>task.id===undo.original.id)||state.taskHistory.find(task=>task.id===undo.original.id);
 if(!current||current.completedAt!==undo.completedAt)return state;
 const restored={...current,stage:undo.original.stage,done:undo.original.done,completedAt:undo.original.completedAt,measuredSeconds:undo.original.measuredSeconds,trackingStartedAt:undo.original.trackingStartedAt};
 // A later edited recurrence is user work and must survive Undo.
 const recurrenceUnchanged=undo.recurrence&&state.tasks.some(task=>task.id===undo.recurrence!.id&&JSON.stringify(task)===JSON.stringify(undo.recurrence));
 const promoted=undo.archived.filter(snapshot=>state.taskHistory.some(task=>task.id===snapshot.id&&JSON.stringify(task)===JSON.stringify(snapshot))&&!state.tasks.some(task=>task.id===snapshot.id));
 const promotedIds=new Set(promoted.map(task=>task.id));
 return {...state,tasks:[restored,...state.tasks.filter(task=>task.id!==restored.id&&!(recurrenceUnchanged&&task.id===undo.recurrence!.id)),...promoted.map(({archivedAt:_a,subjectName:_n,subjectColor:_c,...task})=>task)],taskHistory:state.taskHistory.filter(task=>task.id!==restored.id&&!promotedIds.has(task.id))};
}
export function moveTaskToStage(state: State, id: string, stage: Stage, now = Date.now()): State {
 if(stage==='Completed')return completeTask(state,id,now).state;
 return {...state,tasks:state.tasks.map(task=>task.id===id?{...task,stage,done:false,completedAt:undefined}:task)};
}
export function createHistoryFollowUp(state: State, id: string, now = Date.now()): State {
 const task=getTaskHistoryRecords(state).find(item=>item.id===id);if(!task)return state;
 const {archivedAt:_archived,subjectName:_name,subjectColor:_color,...original}=task;
 return {...state,tasks:[{...original,id:crypto.randomUUID(),done:false,stage:'To study',completedAt:undefined,trackingStartedAt:undefined,measuredSeconds:undefined,recurring:false,due:localDate(new Date(now)),subtasks:original.subtasks.map(item=>({...item,done:false}))},...state.tasks]};
}
