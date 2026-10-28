import type { Subject, Task } from './model';
import type { CalendarEvent, EventCalendarProposedUpdate } from './components/ui/reui-event-calendar-utils/event-calendar-types';
export const PERSONAL_CALENDAR_RESOURCE='__verdant_personal__';
export const calendarDayKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function parseCalendarDay(value:string):Date|null{
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match)return null;
 const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
 return Number.isFinite(date.getTime())&&calendarDayKey(date)===value?date:null;
}
const subjectColors={green:'#229767',blue:'#4e83df',orange:'#d68a3f',purple:'#9061d6'};
export function taskToCalendarEvent(task:Task,subjects:Subject[]):CalendarEvent<Task>|null{
 const start=parseCalendarDay(task.due);if(!start||!Number.isFinite(task.duration)||task.duration<=0)return null;
 const allDay=!task.time;
 if(!allDay){const match=/^(\d{2}):(\d{2})$/.exec(task.time!);if(!match||Number(match[1])>23||Number(match[2])>59)return null;start.setHours(Number(match[1]),Number(match[2]),0,0);}
 const end=new Date(allDay?start:start.getTime()+task.duration*60_000);if(allDay)end.setDate(end.getDate()+1);
 const subject=subjects.find(subject=>subject.id===task.subject);
 return {id:task.id,title:task.title,start,end,allDay,priority:5-task.priority,color:task.done?'#7b8797':subject?subjectColors[subject.color]:'#7957d5',readOnly:task.done,resourceId:task.subject||PERSONAL_CALENDAR_RESOURCE,data:task};
}
export type CalendarTaskPatch=Pick<Task,'due'|'time'|'duration'|'subject'>;
export function calendarUpdateToTask(task:Task,update:Pick<EventCalendarProposedUpdate<Task>,'start'|'end'|'allDay'|'resourceId'|'source'>,subjectIds:string[]):CalendarTaskPatch{
 if(task.done)throw new Error('Reopen this completed task before rescheduling it.');
 if(!Number.isFinite(update.start.getTime())||!Number.isFinite(update.end.getTime())||update.end<=update.start)throw new Error('Choose a valid start and end time.');
 const subject=update.resourceId===undefined?task.subject:update.resourceId===PERSONAL_CALENDAR_RESOURCE?'':update.resourceId;
 if(subject&&!subjectIds.includes(subject))throw new Error('Choose an existing workspace subject.');
 // An untimed task uses its own planned duration when first placed on a clock.
 const duration=update.allDay?task.duration:update.source==='drag'&&!task.time?task.duration:Math.round((update.end.getTime()-update.start.getTime())/60_000);
 if(!Number.isFinite(duration)||duration<5||duration>480)throw new Error('Task durations must be between 5 minutes and 8 hours. Use Edit task for a longer study plan.');
 return {due:calendarDayKey(update.start),time:update.allDay?'':`${String(update.start.getHours()).padStart(2,'0')}:${String(update.start.getMinutes()).padStart(2,'0')}`,duration,subject};
}
