import { describe, expect, it } from 'vitest';
import { createEmptyState, validateWorkspaceState } from './model';
import type { State, Task } from './model';
import { archiveCompletedTasks, completeTask, createHistoryFollowUp, getTaskHistoryRecords, measuredTaskSeconds, taskCompletionDay, undoTaskCompletion } from './task-history';
const now=new Date(2026,9,26,12).getTime();
const task=(id:string,overrides:Partial<Task>={}):Task=>({id,title:'User task '+id,subject:'subject',priority:2,due:'2026-10-26',duration:25,labels:[],stage:'To study',done:false,notes:'',subtasks:[],...overrides});
const completed=(id:string,offset:number)=>task(id,{done:true,stage:'Completed',completedAt:new Date(now-offset*1000).toISOString()});
describe('durable completion archive',()=>{
 it('keeps the newest four completed cards and archives overflow without dropping any record',()=>{
  const state=createEmptyState();state.tasks=[...Array.from({length:7},(_,index)=>completed(String(index),index)),task('pending')];
  const result=archiveCompletedTasks(state,now);
  expect(result.tasks.filter(item=>item.done).map(item=>item.id)).toEqual(['0','1','2','3']);
  expect(result.taskHistory.map(item=>item.id)).toEqual(['4','5','6']);
  expect(new Set([...result.tasks,...result.taskHistory].map(item=>item.id)).size).toBe(8);
  expect(archiveCompletedTasks(result,now)).toBe(result);
 });
 it('completion places the new item first, finalizes actual tracked time, and preserves a recurring occurrence',()=>{
  const state=createEmptyState();state.tasks=[task('repeat',{recurring:true,measuredSeconds:30,trackingStartedAt:new Date(now-90_000).toISOString(),subtasks:[{id:'sub',title:'Read',done:true}]}),...Array.from({length:4},(_,index)=>completed(String(index),index+1))];
  const result=completeTask(state,'repeat',now),done=result.state.tasks[0];
  expect(done).toMatchObject({id:'repeat',done:true,measuredSeconds:120,trackingStartedAt:undefined});
  expect(result.state.taskHistory.map(item=>item.id)).toEqual(['3']);
  expect(result.undo?.recurrence).toMatchObject({done:false,completedAt:undefined,measuredSeconds:undefined,due:'2026-10-27',subtasks:[{id:'sub',title:'Read',done:false}]});
  expect(getTaskHistoryRecords(result.state)).toHaveLength(5);
 });
 it('Undo restores the original completed pane and leaves a later edited recurrence intact',()=>{
  const state=createEmptyState();state.tasks=[task('repeat',{recurring:true}),...Array.from({length:4},(_,index)=>completed(String(index),index+1))];
  const result=completeTask(state,'repeat',now);expect(result.undo).toBeDefined();
  const later={...result.state,tasks:result.state.tasks.map(item=>item.id===result.undo!.recurrence!.id?{...item,title:'My later edit'}:item)};
  const undone=undoTaskCompletion(later,result.undo!);
  expect(undone.tasks.filter(item=>item.done)).toHaveLength(4);
  expect(undone.taskHistory).toEqual([]);
  expect(undone.tasks.find(item=>item.id==='repeat')?.done).toBe(false);
  expect(undone.tasks.some(item=>item.title==='My later edit')).toBe(true);
 });
 it('never substitutes a planned duration or archive timestamp for unmeasured legacy work',()=>{
  const original=task('old',{done:true,stage:'Completed',completedAt:undefined,duration:180});
  expect(measuredTaskSeconds(original)).toBeUndefined();expect(taskCompletionDay(original)).toBe('unknown');
  expect(taskCompletionDay({...original,completedAt:'2026-99-99'})).toBe('unknown');
  const state=createEmptyState();state.tasks=[original,...Array.from({length:4},(_,index)=>completed(String(index),index))];
  const archived=archiveCompletedTasks(state,now).taskHistory[0];
  expect(archived.completedAt).toBeUndefined();expect(measuredTaskSeconds(archived)).toBeUndefined();
 });
 it('studying an archived task again creates a new task and retains its completion snapshot',()=>{
  const state=createEmptyState();state.taskHistory=[{...completed('old',1),archivedAt:new Date(now).toISOString(),measuredSeconds:90}];
  const result=createHistoryFollowUp(state,'old',now);
  expect(result.taskHistory).toEqual(state.taskHistory);expect(result.tasks[0].id).not.toBe('old');
  expect(result.tasks[0]).toMatchObject({done:false,measuredSeconds:undefined,completedAt:undefined});
 });
});
describe('workspace migration',()=>{
 it('adds history to version two without mutating the retained legacy snapshot',()=>{
  const original={...createEmptyState(),version:2,tasks:[task('actual')]};delete (original as Partial<State>).taskHistory;
  const before=JSON.stringify(original),result=validateWorkspaceState(original);
  expect(result.version).toBe(3);expect(result.taskHistory).toEqual([]);expect(result.tasks[0].id).toBe('actual');expect(JSON.stringify(original)).toBe(before);
 });
 it('rejects corrupt or duplicate task data rather than silently replacing it',()=>{
  const original=createEmptyState();original.tasks=[task('same'),task('same')];expect(()=>validateWorkspaceState(original)).toThrow(/duplicate/);
  expect(()=>validateWorkspaceState({...createEmptyState(),taskHistory:null})).toThrow(/history/);
 });
});
