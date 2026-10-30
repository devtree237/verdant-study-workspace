import { SmoothSelect } from './components/ui/SmoothSelect';
import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, Clock3, FileText, Link2, Plus, Repeat2, Settings2, Trash2, X } from 'lucide-react';
import { EventCalendar, useEventCalendar, useEventCalendarNavigation, useEventCalendarView, useEventCalendarViewSettings } from './components/ui/reui-event-calendar';
import { EventCalendarContent } from './components/ui/reui-event-calendar-utils/event-calendar-content';
import type { CalendarView, EventCalendarProposedUpdate, EventCalendarResource, EventCalendarSlotDraft, EventCalendarSlotInfo } from './components/ui/reui-event-calendar-utils/event-calendar-types';
import type { Task, Subject } from './model';
import type { TaskDraft } from './Tasks';
import { useStore } from './store';
import { Markdown, Modal, SubjectBadge, duration, gsap, useGSAP } from './ui';
import { completeTask, moveTaskToStage, undoTaskCompletion } from './task-history';
import type { CompletionUndo } from './task-history';
import { PERSONAL_CALENDAR_RESOURCE, calendarDayKey, calendarUpdateToTask, parseCalendarDay, taskToCalendarEvent } from './task-calendar';
import type { CalendarTaskPatch } from './task-calendar';
import { CalendarTaskTray } from './CalendarTaskTray';
import './task-calendar.css';

type Props={tasks:Task[];onAdd:(initial?:TaskDraft)=>void;onEdit:(task:Task)=>void;onLink:(type:'resource'|'mistake',id:string)=>void};
const BASE_VIEWS:CalendarView[]=['month','week','day','days','agenda','resource'];
const I18N={labels:{allDay:'Any time',noEvents:'No tasks scheduled in this period.',addEvent:'Add task',resources:'Subjects',event:'Task',events:(count:number)=>`${count} task${count===1?'':'s'}`},viewNames:{resource:'Subjects'}};
const CLASS_NAMES={content:'verdant-calendar-content',event:'verdant-task-event',monthView:'verdant-month',timeGrid:'verdant-time-grid',agendaView:'verdant-agenda',dayColumn:'verdant-day-column',morePopover:'verdant-calendar-overflow'};

function CalendarNavigation({onAdd}:{onAdd:Props['onAdd']}){
 const calendar=useEventCalendar(),navigation=useEventCalendarNavigation(),{view,dayCount,setView}=useEventCalendarView(),{viewSettings,setViewSettings,effective}=useEventCalendarViewSettings();
 const current=view==='days'?'days-'+dayCount:view;
 return <header className="task-calendar-toolbar"><div className="task-calendar-nav"><span className="task-calendar-symbol"><CalendarDays size={19}/></span><div><span className="task-calendar-eyebrow">YOUR STUDY SCHEDULE</span><h2 aria-live="polite" title={navigation.title}><span className="calendar-title-wide">{navigation.title}</span><span className="calendar-title-compact">{view==='day'||view==='resource'?navigation.date.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'}):navigation.title}</span></h2></div><button className="calendar-today" onClick={navigation.today}>Today</button><div className="calendar-period-buttons"><button aria-label="Previous calendar period" onClick={navigation.prev}><ArrowLeft size={15}/></button><button aria-label="Next calendar period" onClick={navigation.next}><ArrowRight size={15}/></button></div></div><div className="task-calendar-actions"><label className="calendar-jump"><CalendarDays size={13}/><input type="date" aria-label="Go to calendar date" value={calendarDayKey(navigation.date)} onChange={event=>{const date=parseCalendarDay(event.target.value);if(date)navigation.goTo(date);}}/></label><label className="calendar-view-select"><span className="sr-only">Calendar view</span><SmoothSelect aria-label="Calendar view" value={current} onChange={event=>{const value=event.target.value;if(value.startsWith('days-'))setView('days',{dayCount:Number(value.slice(5))});else setView(value as CalendarView);}}><option value="month">Month</option><option value="week">Week</option><option value="day">Day</option><option value="days-3">3 days</option><option value="days-5">5 days</option><option value="agenda">Agenda</option><option value="resource">Subjects</option></SmoothSelect></label><details className="calendar-view-options"><summary aria-label="Calendar display settings"><Settings2 size={15}/></summary><div><label><input type="checkbox" aria-label="Show weekends" checked={effective.weekends} onChange={event=>setViewSettings({...viewSettings,weekends:event.target.checked})}/>Show weekends</label><label><input type="checkbox" aria-label="Show week numbers" checked={effective.weekNumbers} onChange={event=>setViewSettings({...viewSettings,weekNumbers:event.target.checked})}/>Show week numbers</label><label><input type="checkbox" aria-label="Current time line" checked={effective.nowIndicator} onChange={event=>setViewSettings({...viewSettings,nowIndicator:event.target.checked})}/>Current time line</label></div></details><button className="button tonal small" onClick={()=>onAdd({due:calendarDayKey(calendar.getState().date),time:''})}><Plus size={14}/><span>Add task</span></button></div></header>;
}
function AnimatedCalendarContent(){
 const {view}=useEventCalendarView(),{date}=useEventCalendarNavigation(),root=useRef<HTMLDivElement>(null);
 useGSAP(()=>{gsap.fromTo(root.current,{opacity:0,y:7},{opacity:1,y:0,duration:duration(.24),ease:'expo.out',clearProps:'opacity,transform'});},{scope:root,dependencies:[view,date.getTime()],revertOnUpdate:true});
 return <div className="calendar-content-wrap" ref={root}><EventCalendarContent/></div>;
}
export function TaskCalendar({tasks,onAdd,onEdit,onLink}:Props){
 const {data,update,notify}=useStore(),[selected,setSelected]=useState<string|null>(null),[remove,setRemove]=useState<Task|null>(null),[unscheduledOpen,setUnscheduledOpen]=useState(()=>tasks.some(task=>!task.done&&(!task.time||!taskToCalendarEvent(task,data.subjects)))),[error,setError]=useState('');
 const events=useMemo(()=>tasks.map(task=>taskToCalendarEvent(task,data.subjects)).filter((event):event is NonNullable<typeof event>=>!!event),[tasks,data.subjects]);
 const toSchedule=tasks.filter(task=>!task.done&&(!task.time||!events.some(event=>event.id===task.id)));
 const resources=useMemo<EventCalendarResource[]>(()=>{
  const colors:Record<Subject['color'],string>={green:'#229767',blue:'#4e83df',orange:'#d68a3f',purple:'#9061d6'};
  const items=data.subjects.map(subject=>({id:subject.id,title:subject.name,color:colors[subject.color]}));
  if(tasks.some(task=>!task.subject)||!items.length)items.push({id:PERSONAL_CALENDAR_RESOURCE,title:'Personal',color:'#7957d5'});
  for(const id of new Set(tasks.map(task=>task.subject).filter(Boolean)))if(!items.some(item=>item.id===id))items.push({id,title:'Unavailable subject',color:'#7b8797'});
  return items;
 },[data.subjects,tasks]);
 const selectedTask=data.tasks.find(task=>task.id===selected),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 function create(slot:EventCalendarSlotInfo|EventCalendarSlotDraft){
  const start='start'in slot?slot.start:slot.date,end=slot.end,subject=slot.resourceId===PERSONAL_CALENDAR_RESOURCE?'':slot.resourceId;
  onAdd({due:calendarDayKey(start),time:slot.allDay?'':`${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`,...(!slot.allDay&&end?{duration:Math.min(480,Math.max(5,Math.round((end.getTime()-start.getTime())/60000)))}:{}),...(subject!==undefined?{subject}:{})});
 }
 function reschedule(proposal:EventCalendarProposedUpdate<Task>){
  try{
   let original:CalendarTaskPatch|undefined,applied:CalendarTaskPatch|undefined;
   update(state=>{const task=state.tasks.find(task=>task.id===proposal.event.id);if(!task)return state;const patch=calendarUpdateToTask(task,proposal,state.subjects.map(subject=>subject.id));original={due:task.due,time:task.time,duration:task.duration,subject:task.subject};applied=patch;return {...state,tasks:state.tasks.map(item=>item.id===task.id?{...item,...patch}:item)};});
   if(!applied)return false;
   notify(proposal.source.startsWith('resize')?'Task duration updated':'Task rescheduled',()=>{if(!original||!applied)return;update(state=>({...state,tasks:state.tasks.map(task=>task.id===proposal.event.id&&task.due===applied!.due&&task.time===applied!.time&&task.duration===applied!.duration&&task.subject===applied!.subject?{...task,...original}:task)}));});
   setError('');return true;
  }catch(error){const message=error instanceof Error?error.message:'This task could not be rescheduled.';setError(message);notify(message);return false;}
 }
 function canSchedule(proposal:EventCalendarProposedUpdate<Task>){const task=data.tasks.find(item=>item.id===proposal.event.id);if(!task)return false;try{calendarUpdateToTask(task,proposal,data.subjects.map(subject=>subject.id));return true;}catch{return false;}}
 function finish(task:Task){if(task.done){update(state=>moveTaskToStage(state,task.id,'To study'));notify('Task reopened');}else {let undo:CompletionUndo|undefined;update(state=>{const result=completeTask(state,task.id);undo=result.undo;return result.state;});notify('Task completed. Your work stays in History.',()=>{if(undo)update(state=>undoTaskCompletion(state,undo!));});}setSelected(null);}
 function deleteTask(task:Task){update(state=>({...state,tasks:state.tasks.filter(item=>item.id!==task.id)}));setRemove(null);notify('Task deleted',()=>update(state=>({...state,tasks:state.tasks.some(item=>item.id===task.id)?state.tasks:[task,...state.tasks]})));}
 return <section className="verdant-calendar" aria-label="Task calendar"><EventCalendar events={events} defaultView={typeof window!=='undefined'&&window.matchMedia('(max-width:650px)').matches?'day':'week'} resources={resources} views={BASE_VIEWS} weekStartsOn={1} dayStartHour={0} dayEndHour={24} interval={60} slotDuration={15} snapDuration={15} scrollToHour={7} agendaDayCount={30} maxEventsPerCell={3} showDayAddButton scrollbars="native" eventTooltip i18n={I18N} classNames={CLASS_NAMES} className="task-calendar-root" onEventClick={occurrence=>setSelected(occurrence.eventId)} onEventUpdate={reschedule} canDropEvent={canSchedule} onSlotClick={create} onSelectSlot={create} onDragBlocked={()=>notify('Reopen a completed task before moving it.')} renderAgendaEventDetails={occurrence=>{const task=occurrence.event.data;return task?<div className="calendar-agenda-details"><p><b>Stage:</b> {task.stage} · <b>Planned:</b> {task.duration} minutes</p>{task.notes&&<Markdown>{task.notes}</Markdown>}{task.subtasks.length>0&&<ul>{task.subtasks.map(item=><li key={item.id}>{item.done?'✓':'○'} {item.title}</li>)}</ul>}</div>:null;}}><CalendarNavigation onAdd={onAdd}/><div className="calendar-scheduling-layout">{unscheduledOpen&&<CalendarTaskTray tasks={toSchedule} onEdit={onEdit} onClose={()=>setUnscheduledOpen(false)}/>}<AnimatedCalendarContent/></div></EventCalendar>
  <footer className="task-calendar-footer"><span><Clock3 size={12}/>{timeZone.replaceAll('_',' ')}</span><span>{events.length} scheduled task{events.length===1?'':'s'} · times use your device time zone</span><button aria-expanded={unscheduledOpen} onClick={()=>setUnscheduledOpen(!unscheduledOpen)}>Work tray · {toSchedule.length}<ChevronDown size={12} className={unscheduledOpen?'rotate-180':''}/></button></footer>
  {error&&<div className="calendar-error" role="alert">{error}<button aria-label="Dismiss calendar error" onClick={()=>setError('')}><X size={13}/></button></div>}
  <p className="calendar-gesture-help">Drag to move · Pull the top or bottom edge to resize · Snaps to 15 minutes</p>
  {selectedTask&&<Modal title="Task details" onClose={()=>setSelected(null)}><div className="calendar-task-details"><span className="calendar-task-status"><CheckCircle2 size={13}/>{selectedTask.stage}{selectedTask.recurring&&<><Repeat2 size={12}/>Repeats daily</>}</span><h2>{selectedTask.title}</h2><div className="calendar-detail-facts"><span><CalendarDays size={14}/>{selectedTask.due?new Date(selectedTask.due+'T12:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'long',year:'numeric'}):'No date'}</span><span><Clock3 size={14}/>{selectedTask.time||'Any time'} · {selectedTask.duration} min planned</span><SubjectBadge id={selectedTask.subject}/></div>{selectedTask.notes&&<Markdown>{selectedTask.notes}</Markdown>}{selectedTask.subtasks.length>0&&<ul className="calendar-detail-subtasks">{selectedTask.subtasks.map(item=><li key={item.id}><span>{item.done?<Check size={12}/>:<span/>}</span>{item.title}</li>)}</ul>}{selectedTask.link&&<button className="text-link" onClick={()=>{setSelected(null);onLink(selectedTask.link!.type,selectedTask.link!.id);}}><Link2 size={13}/>Open linked {selectedTask.link.type}</button>}<div className="calendar-task-secondary-actions"><button onClick={()=>finish(selectedTask)}><CheckCircle2 size={14}/>{selectedTask.done?'Reopen task':'Complete task'}</button><button onClick={()=>{setRemove(selectedTask);setSelected(null);}}><Trash2 size={14}/>Delete task</button></div></div><footer className="modal-footer"><button className="button secondary" onClick={()=>setSelected(null)}>Close</button><button className="button primary" onClick={()=>{setSelected(null);onEdit(selectedTask);}}><FileText size={14}/>Edit task</button></footer></Modal>}
  {remove&&<Modal title="Delete this task?" onClose={()=>setRemove(null)}><div className="modal-body"><p className="calendar-delete-copy">“{remove.title}” will be removed from your tasks. You can restore it using Undo.</p></div><footer className="modal-footer"><button className="button secondary" onClick={()=>setRemove(null)}>Keep task</button><button className="button danger" onClick={()=>deleteTask(remove)}><Trash2 size={14}/>Delete task</button></footer></Modal>}
 </section>;
}
export default TaskCalendar;
