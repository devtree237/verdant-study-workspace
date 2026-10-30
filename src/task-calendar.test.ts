import { describe, expect, it } from 'vitest';
import { PERSONAL_CALENDAR_RESOURCE, calendarDayKey, calendarUpdateToTask, parseCalendarDay, taskToCalendarEvent, taskToCalendarDragEvent } from './task-calendar';
import type { Subject, Task } from './model';
const subjects:Subject[]=[{id:'physics',name:'Physics',color:'blue'},{id:'chemistry',name:'Chemistry',color:'green'}];
const task=(patch:Partial<Task>={}):Task=>({id:'actual-task',title:'Authored study task',subject:'physics',priority:2,due:'2026-10-27',duration:25,labels:[],stage:'To study',done:false,notes:'',subtasks:[],...patch});
const at=(hour:number,minute=0)=>new Date(2026,9,27,hour,minute);
describe('real task calendar mapping',()=>{
 it('shows untimed tasks on their actual due day without treating planned time as a full-day duration',()=>{
  const source=task(),event=taskToCalendarEvent(source,subjects)!;
  expect(calendarDayKey(event.start)).toBe('2026-10-27');expect(calendarDayKey(event.end)).toBe('2026-10-28');expect(event.allDay).toBe(true);expect(event.timedDurationMinutes).toBe(25);expect(event.data).toBe(source);expect(source.duration).toBe(25);
 });
 it('uses actual local start time, planned duration and existing subject identity',()=>{
  const event=taskToCalendarEvent(task({time:'09:30'}),subjects)!;
  expect([event.start.getHours(),event.start.getMinutes()]).toEqual([9,30]);expect((event.end.getTime()-event.start.getTime())/60000).toBe(25);expect(event.resourceId).toBe('physics');expect(event.allDay).toBe(false);
 });
 it('does not invent future occurrences or schedule missing/invalid dates',()=>{
  expect(taskToCalendarEvent(task({due:''}),subjects)).toBeNull();expect(parseCalendarDay('2026-02-30')).toBeNull();expect(taskToCalendarEvent(task({time:'25:10'}),subjects)).toBeNull();
  const event=taskToCalendarEvent(task({recurring:true,subject:''}),subjects)!;expect(event.recurrence).toBeUndefined();expect(event.resourceId).toBe(PERSONAL_CALENDAR_RESOURCE);
 });
 it('preserves the real elapsed duration when a timed task crosses midnight',()=>{
  const event=taskToCalendarEvent(task({time:'23:50',duration:30}),subjects)!;expect(calendarDayKey(event.end)).toBe('2026-10-28');expect((event.end.getTime()-event.start.getTime())/60000).toBe(30);
 });
 it('treats completed task events as read-only while retaining their identity',()=>{
  const event=taskToCalendarEvent(task({done:true,stage:'Completed'}),subjects)!;expect(event.id).toBe('actual-task');expect(event.readOnly).toBe(true);
 });
});
describe('calendar scheduling changes',()=>{
 it('prepares an undated saved task for dragging without committing a date or creating another task',()=>{
  const source=task({due:'',time:''}),preview=taskToCalendarDragEvent(source,subjects,at(9))!;
  expect(preview.id).toBe(source.id);expect(preview.data).toBe(source);expect(preview.timedDurationMinutes).toBe(25);expect(calendarDayKey(preview.start)).toBe('2026-10-27');expect(source.due).toBe('');expect(source.time).toBe('');
 });
 it('does not make draggable previews for completed, invalid or excessive plans',()=>{
  expect(taskToCalendarDragEvent(task({done:true}),subjects,at(9))).toBeNull();expect(taskToCalendarDragEvent(task({duration:481}),subjects,at(9))).toBeNull();expect(taskToCalendarDragEvent(task(),subjects,new Date(NaN))).toBeNull();
 });
 it('resizes the beginning while retaining the supplied end and unrelated task fields',()=>{
  const source=task({time:'09:30',duration:60,notes:'Keep this note',stage:'Practicing'}),patch=calendarUpdateToTask(source,{start:at(9),end:at(10,30),allDay:false,source:'resize-start'},['physics']);
  expect({...source,...patch}).toMatchObject({id:source.id,time:'09:00',duration:90,notes:'Keep this note',stage:'Practicing',subject:'physics'});expect(source.time).toBe('09:30');
 });
 it('moves an untimed task onto the clock using its own planned duration',()=>{
  const patch=calendarUpdateToTask(task(),{start:at(10),end:new Date(at(10).getTime()+86400000),allDay:false,source:'drag'},subjects.map(subject=>subject.id));expect(patch).toEqual({due:'2026-10-27',time:'10:00',duration:25,subject:'physics'});
 });
 it('resizes a timed task and changes a resource only to a real workspace subject',()=>{
  const patch=calendarUpdateToTask(task({time:'09:30'}),{start:at(10),end:at(10,45),allDay:false,resourceId:'chemistry',source:'resize-end'},subjects.map(subject=>subject.id));expect(patch).toEqual({due:'2026-10-27',time:'10:00',duration:45,subject:'chemistry'});
 });
 it('clears a clock time when moved to Any time while keeping its planned duration',()=>{
  const patch=calendarUpdateToTask(task({time:'09:30'}),{start:at(0),end:new Date(2026,9,28),allDay:true,resourceId:PERSONAL_CALENDAR_RESOURCE,source:'drag'},subjects.map(subject=>subject.id));expect(patch).toMatchObject({time:'',duration:25,subject:''});
 });
 it('rejects invalid ranges, absent subjects and attempts to move completed tasks',()=>{
  const ids=subjects.map(subject=>subject.id),proposal={start:at(10),end:at(11),allDay:false,source:'drag' as const};
  expect(()=>calendarUpdateToTask(task({done:true}),proposal,ids)).toThrow(/Reopen/);expect(()=>calendarUpdateToTask(task({...task(),time:'09:30'}),{...proposal,end:at(23)},ids)).toThrow(/8 hours/);expect(()=>calendarUpdateToTask(task(),{...proposal,resourceId:'invented-subject'},ids)).toThrow(/existing workspace subject/);expect(()=>calendarUpdateToTask(task(),{...proposal,end:at(9)},ids)).toThrow(/valid start/);
 });
});
