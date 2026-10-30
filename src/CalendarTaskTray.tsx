import { GripVertical, Pencil, Inbox, X } from 'lucide-react';
import { useEventCalendar, useEventCalendarNavigation } from './components/ui/reui-event-calendar';
import { useEventCalendarGestures, wasRecentDrag } from './components/ui/reui-event-calendar-utils/event-calendar-dnd';
import type { Task } from './model';
import { useStore } from './store';
import { SubjectBadge } from './ui';
import { taskToCalendarDragEvent } from './task-calendar';
import './calendar-task-tray.css';

export function CalendarTaskTray({tasks,onEdit,onClose}:{tasks:Task[];onEdit:(task:Task)=>void;onClose:()=>void}){
 const {data}=useStore(),calendar=useEventCalendar<Task>(),{date}=useEventCalendarNavigation(),gestures=useEventCalendarGestures<Task>();
 return <aside className="calendar-task-tray" aria-label="Work to schedule">
  <header><div><span className="calendar-tray-eyebrow">YOUR WORK</span><h3>Work to schedule <span>{tasks.length}</span></h3></div><button aria-label="Close work tray" onClick={onClose}><X size={15}/></button></header>
  <p className="calendar-tray-help">Drag a task onto a time slot. Use Edit to set an exact date and time.</p>
  <div className="calendar-tray-items">{tasks.length?tasks.map(task=>{
   const event=taskToCalendarDragEvent(task,data.subjects,date);
   return <div className="calendar-tray-task" key={task.id}>
    <button className="calendar-tray-drag" aria-label={`Drag ${task.title} to calendar; press Enter to schedule`} title="Drag onto the calendar, or press Enter to edit the schedule" disabled={!event} onPointerDown={pointer=>{const current=data.tasks.find(item=>item.id===task.id);const preview=current&&taskToCalendarDragEvent(current,data.subjects,calendar.getState().date);if(preview)gestures.beginExternalMove(pointer,preview);}} onClick={()=>{if(wasRecentDrag())return;const current=data.tasks.find(item=>item.id===task.id);if(current)onEdit(current);}}>
     <GripVertical size={15} aria-hidden="true"/><span><b>{task.title}</b><small>{task.duration} min planned{task.due?' · '+new Date(task.due+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short'}):' · No date'}</small><SubjectBadge id={task.subject}/></span>
    </button>
    <button className="calendar-tray-edit" aria-label={`Edit schedule for ${task.title}`} onClick={()=>onEdit(data.tasks.find(item=>item.id===task.id)||task)}><Pencil size={13}/></button>
   </div>;
  }):<div className="calendar-tray-empty"><Inbox size={24}/><b>Everything has a time</b><p>Tasks without a date or time will appear here.</p></div>}</div>
 </aside>;
}
