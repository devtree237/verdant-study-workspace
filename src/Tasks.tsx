import { SmoothSelect } from './components/ui/SmoothSelect';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { TaskBoard } from './TaskBoard';
import { completeTask, measuredTaskSeconds, moveTaskToStage, stopTaskClock, undoTaskCompletion } from './task-history';
import type { CompletionUndo } from './task-history';
import './task-board.css';
import { Plus, CalendarDays, Flag, Hash, Link2, Bell, List, Columns3, SlidersHorizontal, ChevronDown, ChevronRight, Clock3, MessageSquare, Pencil, Trash2, Repeat2, ArrowRight, CircleCheck, Ellipsis, Pause, Play } from 'lucide-react';
import { useStore } from './store';
import { day, dateLabel, parseTask, uid } from './model';
import type { Task, Stage } from './model';
import { Modal, SubjectBadge, Empty, gsap, Flip, useGSAP, duration, motion } from './ui';
import { TaskDictation, appendTranscript } from './speech';
import { playCompletionTick } from './task-completion-motion';
export type TaskDraft = Partial<Task>;
export function TaskForm({task,initial,onClose}:{task?:Task;initial?:TaskDraft;onClose:()=>void}) {
 const {data,update,notify}=useStore();const [raw,setRaw]=useState(task?.title||initial?.title||'');const [subject,setSubject]=useState(task?.subject||initial?.subject||'');const [due,setDue]=useState(task?.due??initial?.due??day());const [priority,setPriority]=useState(task?.priority||initial?.priority||4);const [time,setTime]=useState(task?.time||initial?.time||'');const [minutes,setMinutes]=useState(task?.duration??initial?.duration??25);const [notes,setNotes]=useState(task?.notes||'');const [labels,setLabels]=useState((task?.labels??initial?.labels??[]).join(', '));const [recurring,setRecurring]=useState(task?.recurring||false);const [reminder,setReminder]=useState(task?.reminder||'');const [subtasks,setSubtasks]=useState(task?.subtasks.map(s=>s.title).join('\n')||'');const [link,setLink]=useState(task?.link?`${task.link.type}:${task.link.id}`:'');const [details,setDetails]=useState(!!task);const [error,setError]=useState('');const parsed=parseTask(raw,data.subjects);
 const [dictating,setDictating]=useState(false);const titleHintId=useId();
 function save(e:React.FormEvent){e.preventDefault();if(dictating){setError('Stop dictation and wait for the transcript before saving.');return;}if(!parsed.title){setError('Give your task a title to get started.');return;}const [type,id]=link.split(':');const item:Task={id:task?.id||uid(),title:parsed.title,subject:parsed.subject??subject,priority:/\bp[1-4]\b/i.test(raw)?parsed.priority:priority,due:parsed.due||due,time,duration:minutes,labels:[...new Set([...labels.split(',').map(s=>s.trim()).filter(Boolean),...parsed.labels])],recurring:parsed.recurring||recurring,reminder:reminder||undefined,stage:task?.stage||initial?.stage||'To study',done:task?.done||initial?.stage==='Completed',completedAt:task?.completedAt||(initial?.stage==='Completed'?new Date().toISOString():undefined),measuredSeconds:task?.measuredSeconds,trackingStartedAt:task?.trackingStartedAt,notes,subtasks:subtasks.split('\n').filter(s=>s.trim()).map((title,i)=>({id:task?.subtasks[i]?.id||uid(),title:title.trim(),done:task?.subtasks[i]?.done||false})),link:id?{type:type as 'resource'|'mistake',id}:undefined};update(s=>({...s,tasks:task?s.tasks.map(t=>t.id===task.id?item:t):[...s.tasks,item]}));notify(task?'Task updated':'Task added to your workspace');onClose();}
 const tokens=raw.match(/#[\w-]+|@[\w-]+|\bp[1-4]\b|\btoday\b|\btomorrow\b|\bevery day\b|\bnext \w+\b/gi)||[];
 return <Modal title={task?'Edit task':'Make space for your next step'} onClose={onClose}><form className="task-form" onSubmit={save}><div className="modal-body task-entry-body"><div className="task-entry-title"><input className="quick-title" aria-label="Task title" aria-describedby={titleHintId} placeholder="What would you like to work on?" value={raw} onChange={e=>{setRaw(e.target.value);setError('');}}/><p id={titleHintId} className="task-entry-hint">Try “Revise electrostatics tomorrow #Physics p1 @revision”</p></div><TaskDictation onTranscript={text=>{setRaw(current=>appendTranscript(current,text));setError('');}} onBusyChange={setDictating}/>{tokens.length>0&&<div className="flex flex-wrap gap-1.5 mt-3" aria-label="Recognized tokens">{tokens.map((t,i)=><span className="token" key={i}>{t}</span>)}</div>}{error&&<p className="form-error" role="alert">{error}</p>}<div className="form-grid mt-6"><label><span><CalendarDays size={14}/>Due date</span><input type="date" value={parsed.due||due} onChange={e=>{setDue(e.target.value);setRaw(raw.replace(/\btoday\b|\btomorrow\b|\bevery day\b|\bnext (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,'').trim());}}/></label><label><span><Flag size={14}/>Priority</span><SmoothSelect value={/\bp[1-4]\b/i.test(raw)?parsed.priority:priority} onChange={e=>{setPriority(Number(e.target.value));setRaw(raw.replace(/\bp[1-4]\b/gi,'').trim());}}>{[1,2,3,4].map(p=><option key={p} value={p}>P{p} · {['Urgent','High','Medium','Normal'][p-1]}</option>)}</SmoothSelect></label><label><span><Hash size={14}/>Subject</span><SmoothSelect value={parsed.subject??subject} onChange={e=>{setSubject(e.target.value);setRaw(raw.replace(/#[\w-]+/g,'').trim());}}><option value="">Inbox · no subject</option>{data.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</SmoothSelect></label><label><span><Link2 size={14}/>Link to study material</span><SmoothSelect value={link} onChange={e=>setLink(e.target.value)}><option value="">No linked material</option><optgroup label="Resources">{data.resources.map(r=><option key={r.id} value={`resource:${r.id}`}>{r.title}</option>)}</optgroup><optgroup label="Mistakes">{data.mistakes.map(m=><option key={m.id} value={`mistake:${m.id}`}>{m.title}</option>)}</optgroup></SmoothSelect></label></div><button type="button" className="text-link mt-5" onClick={()=>setDetails(!details)}><SlidersHorizontal size={14}/>{details?'Fewer options':'Time, reminders & subtasks'}<ChevronDown size={14}/></button>{details&&<div className="mt-4 space-y-4"><div className="form-grid"><label>Start time<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label><label>Duration (minutes)<input type="number" min="5" max="480" step="5" required value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label><label>Labels, separated by commas<input value={labels} onChange={e=>setLabels(e.target.value)} placeholder="revision, homework"/></label><label><span><Bell size={14}/>In-app reminder</span><input type="datetime-local" value={reminder} onChange={e=>setReminder(e.target.value)}/></label></div><p className="text-xs text-slate-500">Reminders appear while Verdant is open.</p><label className="check-label"><input type="checkbox" checked={recurring||parsed.recurring} onChange={e=>{setRecurring(e.target.checked);if(!e.target.checked)setRaw(raw.replace(/\bevery day\b/gi,'').trim());}}/><Repeat2 size={14}/>Repeat every day</label><label>Subtasks · one per line<textarea rows={3} value={subtasks} onChange={e=>setSubtasks(e.target.value)} placeholder="Read the chapter&#10;Solve practice problems"/></label><label>Notes<textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add some context…"/></label></div>}</div><footer className="modal-footer"><span className="text-xs text-slate-400">A little progress, every day.</span><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={dictating}>{task?'Save changes':'Add task'}<ArrowRight size={15}/></button></footer></form></Modal>;
}
const taskStages: Stage[] = ['To study', 'In progress', 'Practicing', 'Completed'];

export function TaskCard({task,board,onEdit,onLink,dragHandle,onComplete,onStageChange}:{task:Task;board?:'stage'|'priority';dragHandle?:ReactNode;onComplete:(task:Task)=>void;onStageChange?:(task:Task,stage:Stage)=>void;onEdit:(t:Task)=>void;onLink:(type:'resource'|'mistake',id:string)=>void}){
 const {update,notify}=useStore();const ref=useRef<HTMLDivElement>(null);const subtasksRef=useRef<HTMLDivElement>(null);const [expanded,setExpanded]=useState(false);const{contextSafe}=useGSAP({scope:ref});
 const [clock,setClock]=useState(Date.now());useEffect(()=>{if(!task.trackingStartedAt)return;const id=window.setInterval(()=>setClock(Date.now()),1000);return()=>window.clearInterval(id);},[task.trackingStartedAt]);
 const tracked=measuredTaskSeconds(task,clock);
 function complete() {
  if (task.done) update(state=>moveTaskToStage(state,task.id,'To study'));
  else onComplete(task);
 }
 const toggle=contextSafe(()=>{setExpanded(!expanded);gsap.to(subtasksRef.current,{height:expanded?0:'auto',opacity:expanded?0:1,duration:duration(.3),ease:'power2.inOut'});});
 function remove(){update(s=>({...s,tasks:s.tasks.filter(t=>t.id!==task.id)}));notify('Task deleted',()=>update(s=>({...s,tasks:[...s.tasks,task]})));}
 const completionButton=<button className={`task-checkbox priority-${task.priority}`} aria-label={`${task.done?'Reopen':'Complete'} ${task.title}`} aria-pressed={task.done} onClick={complete}>
  <svg viewBox="0 0 20 20" aria-hidden="true"><path className="task-check-path" d="m5 10 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="18" strokeDashoffset={task.done?0:18}/></svg>
 </button>;
 const toggleClock = () => update(state => ({
  ...state,
  tasks: state.tasks.map(item => {
   if (item.id !== task.id || item.done) return item;
   return item.trackingStartedAt ? stopTaskClock(item) : { ...item, trackingStartedAt: new Date().toISOString() };
  }),
 }));
 const clockLabel = `${task.trackingStartedAt?'Pause':'Start'} task timer for ${task.title}`;
 const elapsed = tracked === undefined ? null : `${Math.floor(tracked / 60)}:${String(Math.floor(tracked % 60)).padStart(2, '0')}`;
 const clockButton=!task.done&&<button className={`task-clock-toggle ${task.trackingStartedAt?'running':''}`} aria-label={clockLabel} onClick={toggleClock}>{task.trackingStartedAt?'Ⅱ':'▷'} {elapsed ?? 'Track time'}</button>;
 const dueDate=task.due&&<span className={task.due<day()&&!task.done?'text-red-500':''}><CalendarDays size={12}/>{task.due<day()&&!task.done?dateLabel(task.due):task.time||dateLabel(task.due)}</span>;
 const studyLink=task.link;
 const linkButton=studyLink&&<button className="linked-pill" aria-label={`Open linked ${studyLink.type}`} onClick={()=>onLink(studyLink.type,studyLink.id)}><Link2 size={12}/>{studyLink.type==='resource'?'Notes':'Review'}</button>;
 if (board) return <div ref={ref} className={`task-card board-task ${task.done?'task-done':''}`} data-flip-id={task.id} data-task-id={task.id} data-priority={task.priority}>
  <div className="board-task-heading">
   {completionButton}
   <button type="button" className="task-title" title={task.title} onClick={()=>onEdit(task)}>{task.title}</button>
   {dragHandle}
   <Menu.Root modal={false}>
    <Menu.Trigger className="board-task-menu-trigger" aria-label={`Actions for ${task.title}`} title="Task actions"><Ellipsis size={17} aria-hidden="true"/></Menu.Trigger>
    <Menu.Portal>
     <Menu.Positioner align="end" sideOffset={6} className="board-menu-positioner">
      <Menu.Popup className="board-task-menu">
       {!task.done && <Menu.Item onClick={toggleClock}>{task.trackingStartedAt ? <Pause size={14} aria-hidden="true"/> : <Play size={14} aria-hidden="true"/>} {task.trackingStartedAt ? 'Pause timer' : elapsed ? 'Resume timer' : 'Start timer'}</Menu.Item>}
       {task.subtasks.length > 0 && <Menu.Item onClick={()=>onEdit(task)}><List size={14} aria-hidden="true"/>Subtasks <span className="board-menu-count">{task.subtasks.filter(subtask=>subtask.done).length}/{task.subtasks.length}</span></Menu.Item>}
       {studyLink && <Menu.Item onClick={()=>onLink(studyLink.type, studyLink.id)}><Link2 size={14} aria-hidden="true"/>{studyLink.type==='resource'?'Open notes':'Review mistake'}</Menu.Item>}
       <Menu.Group>
        <Menu.GroupLabel className="board-menu-label">Move to</Menu.GroupLabel>
        {taskStages.filter(stage=>stage!==task.stage).map(stage=><Menu.Item key={stage} onClick={()=>{
         if (onStageChange) onStageChange(task, stage);
         else update(state=>moveTaskToStage(state, task.id, stage));
        }}>{stage}</Menu.Item>)}
       </Menu.Group>
      </Menu.Popup>
     </Menu.Positioner>
    </Menu.Portal>
   </Menu.Root>
  </div>
  {task.notes.trim()&&<p className="board-task-notes">{task.notes}</p>}
  <div className="board-task-meta">
   <SubjectBadge id={task.subject}/>
   {task.due && <span className={task.due<day()&&!task.done?'text-red-500':''}><CalendarDays size={12} aria-hidden="true"/>{dateLabel(task.due)}{task.time ? ` · ${task.time}` : ''}</span>}
   {board==='priority' && <span>{task.stage}</span>}
   {task.trackingStartedAt && !task.done
    ? <button type="button" className="board-running-timer" aria-label={clockLabel} onClick={toggleClock}><Pause size={12} aria-hidden="true"/>{elapsed ?? '0:00'}</button>
    : elapsed && <span title="Tracked study time"><Clock3 size={12} aria-hidden="true"/>{elapsed}</span>}
  </div>
  {task.priority<4&&<span className="sr-only">Priority {task.priority}</span>}
 </div>;
 return <div ref={ref} className={`task-card ${task.done?'task-done':''}`} data-flip-id={task.id} data-task-id={task.id}><div className="task-row">{completionButton}<div className="task-content"><button className="task-title" onClick={()=>onEdit(task)}><span>{task.title}<span className="task-strike"/></span></button><div className="task-meta">{dueDate}<span title="Planned duration"><Clock3 size={12}/>{task.duration} min planned</span>{clockButton}{task.labels.slice(0,2).map(l=><span key={l} className="task-label">{l}</span>)}{task.subtasks.length>0&&<button onClick={toggle} aria-expanded={expanded}><List size={12}/>{task.subtasks.filter(s=>s.done).length}/{task.subtasks.length}<ChevronDown size={11}/></button>}{task.recurring&&<Repeat2 size={12}/>} {linkButton}</div></div><div className="task-subject"><SubjectBadge id={task.subject}/></div><div className="task-actions"><button className="icon-btn" title="Edit task" aria-label={`Edit ${task.title}`} onClick={()=>onEdit(task)}><Pencil size={14}/></button><button className="icon-btn" title="Reschedule" aria-label={`Reschedule ${task.title}`} onClick={()=>onEdit(task)}><CalendarDays size={14}/></button><button className="icon-btn" title="Notes & comments" aria-label={`Notes for ${task.title}`} onClick={()=>onEdit(task)}><MessageSquare size={14}/></button><button className="icon-btn" title="Delete task" aria-label={`Delete ${task.title}`} onClick={remove}><Trash2 size={14}/></button></div></div><div ref={subtasksRef} className="subtask-accordion" inert={!expanded}><div className="subtask-inner">{task.subtasks.map(sub=><label key={sub.id} className={`subtask ${sub.done?'subtask-done':''}`}><input type="checkbox" checked={sub.done} onChange={()=>update(s=>({...s,tasks:s.tasks.map(t=>t.id===task.id?{...t,subtasks:t.subtasks.map(st=>st.id===sub.id?{...st,done:!st.done}:st)}:t)}))}/>{sub.title}</label>)}</div></div></div>;
}
export function Tasks({page,search,subjectFilter,onAdd,onEdit,onLink,onViewChange,view='list'}:{page:string;search:string;subjectFilter:string;view?:string;onAdd:(initial?:TaskDraft)=>void;onEdit:(t:Task)=>void;onLink:(type:'resource'|'mistake',id:string)=>void;onViewChange:(view:string)=>void}){
 const{data,update,notify}=useStore();const[filter,setFilter]=useState('all');const[group,setGroup]=useState('schedule');const[showCompleted,setShowCompleted]=useState(false);const[overdueOpen,setOverdueOpen]=useState(true);const[week,setWeek]=useState(0);const ref=useRef<HTMLDivElement>(null);const tabsRef=useRef<HTMLDivElement>(null);const tabIndicator=useRef<HTMLSpanElement>(null);const tabReady=useRef(false);
 const {contextSafe}=useGSAP({scope:ref});
 const change=contextSafe((fn:()=>void)=>{const state=Flip.getState(ref.current?.querySelectorAll('.task-card')||[]);flushSync(fn);Flip.from(state,{duration:duration(.45),ease:'power3.out',stagger:.03,absolute:true,fade:true});});
 const finishListTask=contextSafe((task:Task)=>{
  const area=ref.current;
  const previous=Flip.getState(area?.querySelectorAll('.task-card')||[]);
  let undo: CompletionUndo | undefined;
  flushSync(()=>{
   update(state=>{
    const result=completeTask(state,task.id);
    undo=result.undo;
    return result.state;
   });
   const completion=undo;
   if(completion) notify('Task completed. Your progress is saved.',()=>update(state=>undoTaskCompletion(state,completion)));
  });
  if(!undo) return;
  playCompletionTick(area,task.id);
  Flip.from(previous,{targets:area?.querySelectorAll('.task-card')||[],duration:duration(.46),ease:'power3.out',scale:true,prune:true,zIndex:2});
 });

 useGSAP((_context,safe)=>{
   const place=safe!(()=>{const tabs=tabsRef.current,indicator=tabIndicator.current,active=tabs?.querySelector<HTMLElement>('[aria-selected="true"]');if(!tabs||!indicator||!active)return;const parent=tabs.getBoundingClientRect(),box=active.getBoundingClientRect();const target={x:box.left-parent.left,y:box.top-parent.top,width:box.width,height:box.height,opacity:1};if(!tabReady.current)gsap.set(indicator,target);else gsap.to(indicator,{...target,duration:duration(motion.state),ease:motion.easeSoft,overwrite:true});tabReady.current=true;});
   place();const resize=new ResizeObserver(place);if(tabsRef.current)resize.observe(tabsRef.current);return()=>resize.disconnect();
 },{scope:tabsRef,dependencies:[view]});
 const switchView=(next:string)=>change(()=>onViewChange(next));
 function navigateTabs(event:React.KeyboardEvent<HTMLDivElement>){const layouts=['list','board'];let index=layouts.indexOf(view);if(event.key==='ArrowRight')index=(index+1)%layouts.length;else if(event.key==='ArrowLeft')index=(index+layouts.length-1)%layouts.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=layouts.length-1;else return;event.preventDefault();switchView(layouts[index]);tabsRef.current?.querySelector<HTMLButtonElement>(`[aria-selected="true"]`)?.focus();}
 const tasks=useMemo(()=>data.tasks.filter(t=>{
 if(subjectFilter&&t.subject!==subjectFilter)return false;
 if(filter!=='all'&&t.subject!==filter)return false;
 if(search&&!`${t.title} ${t.labels.join(' ')}`.toLowerCase().includes(search.toLowerCase()))return false;
 if(page==='Inbox'&&t.subject)return false;
 if(page==='Today'&&(!t.due||t.due>day()))return false;
 if(page==='Upcoming'&&(!t.due||t.due<day(week*7)||t.due>day(week*7+6)))return false;
 if(page.startsWith('@')&&!t.labels.includes(page.slice(1)))return false;
 return view==='board'||showCompleted||!t.done;
 }).sort((a,b)=>view==='board'?0:a.priority-b.priority),[data.tasks,subjectFilter,filter,search,page,showCompleted,view,week]);
 const boardView = view === 'board';
 const activeTasks=tasks.filter(task=>!task.done);
 const completedTasks=showCompleted?tasks.filter(task=>task.done):[];
 const groups=group==='subject'?data.subjects.map(s=>({name:s.name,items:activeTasks.filter(t=>t.subject===s.id)})).concat([{name:'Personal',items:activeTasks.filter(t=>!t.subject)}]):group==='priority'?[1,2,3,4].map(p=>({name:`Priority ${p}`,items:activeTasks.filter(t=>t.priority===p)})):page==='Upcoming'?Array.from({length:7},(_,i)=>({name:dateLabel(day(week*7+i)),items:activeTasks.filter(t=>t.due===day(week*7+i))})):[{name:'Overdue',items:activeTasks.filter(t=>!!t.due&&t.due<day())},{name:page==='Today'?'Today’s tasks':'Your tasks',items:activeTasks.filter(t=>!t.due||t.due>=day())}];
 const render=(task:Task)=><TaskCard key={task.id} task={task} onComplete={finishListTask} onEdit={onEdit} onLink={onLink}/>;
 return <div ref={ref} className={`tasks-engine task-view-panel${boardView ? ' board-view' : ''}`}>
  <div className="workspace-toolbar">
   <div className="view-tabs has-motion-indicator" ref={tabsRef} role="tablist" aria-label="Task layout" onKeyDown={navigateTabs}>
    <span ref={tabIndicator} className="view-tab-indicator" aria-hidden="true"/>
    {[{id:'list',label:'List',icon:List},{id:'board',label:'Board',icon:Columns3}].map(({id,label,icon:Icon})=><button key={id} role="tab" aria-selected={view===id} tabIndex={view===id?0:-1} className={view===id?'selected':''} onClick={()=>switchView(id)}><Icon size={15}/>{label}</button>)}
   </div>
   <div className="task-view-controls">
    {boardView && !subjectFilter && data.subjects.length>0 && <SmoothSelect className="board-filter-select" aria-label="Filter board by subject" value={filter} onChange={event=>change(()=>setFilter(event.target.value))}>
     <option value="all">All subjects</option>
     {data.subjects.map(subject=><option key={subject.id} value={subject.id}>{subject.name}</option>)}
    </SmoothSelect>}
    {view!=='calendar' && <label className="toolbar-select">
     {!boardView && <SlidersHorizontal size={14}/>}
     <SmoothSelect className={boardView ? 'board-filter-select' : undefined} aria-label="Group tasks" value={boardView&&group==='subject'?'schedule':group} onChange={event=>change(()=>setGroup(event.target.value))}>
      <option value="schedule">{boardView ? 'By stage' : 'Group: schedule'}</option>
      {view==='list' && <option value="subject">Group: subject</option>}
      <option value="priority">{boardView ? 'By priority' : 'Group: priority'}</option>
     </SmoothSelect>
    </label>}
    {view==='list' && <button className={`icon-btn ${showCompleted?'text-emerald-600':''}`} title="Show completed tasks" aria-label="Show completed tasks" aria-pressed={showCompleted} onClick={()=>change(()=>setShowCompleted(!showCompleted))}><CircleCheck size={16}/></button>}
   </div>
  </div>
  {!boardView && <div className="subject-filter"><button className={filter==='all'?'active':''} onClick={()=>change(()=>setFilter('all'))}>All subjects <span>{tasks.length}</span></button>{data.subjects.map(s=><button key={s.id} className={filter===s.id?'active':''} onClick={()=>change(()=>setFilter(s.id))}><span className={`subject-dot tone-${s.color}`}/>{s.name}</button>)}</div>}
  {page==='Upcoming'&&view!=='calendar'&&<div className="calendar-controls"><button className="icon-btn" aria-label="Previous week" onClick={()=>setWeek(week-1)}><ChevronRight className="rotate-180" size={16}/></button><span>{dateLabel(day(week*7))} — {dateLabel(day(week*7+6))}</span><button className="icon-btn" aria-label="Next week" onClick={()=>setWeek(week+1)}><ChevronRight size={16}/></button><button className="text-link" onClick={()=>setWeek(0)}>This week</button></div>}
 {view==='list'&&<><div className="task-groups">{groups.filter(g=>g.items.length).map(g=><section key={g.name} className="task-group"><div className={`task-group-heading ${g.name==='Overdue'?'overdue-heading':''}`}><button onClick={()=>g.name==='Overdue'&&setOverdueOpen(!overdueOpen)} aria-expanded={g.name==='Overdue'?overdueOpen:undefined}>{g.name==='Overdue'&&(overdueOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>)}<h2>{g.name}</h2><span>{g.items.length}</span></button>{g.name==='Overdue'?<button className="text-xs" onClick={()=>update(s=>({...s,tasks:s.tasks.map(t=>g.items.some(x=>x.id===t.id)?{...t,due:day()}:t)}))}>Reschedule all</button>:<span className="group-date">{day()===g.items[0]?.due?'Let’s make it count':''}</span>}</div>{(g.name!=='Overdue'||overdueOpen)&&g.items.map(t=>render(t))}</section>)}
  {completedTasks.length>0&&<section className="task-group" aria-label="Completed tasks">
   <div className="task-group-heading task-completed-heading"><h2>Completed</h2><span>{completedTasks.length}</span></div>
   {completedTasks.map(render)}
  </section>}
 </div>{tasks.length===0&&<Empty title="A little breathing room" description="No tasks match this view. Add your next step or try another filter."/>}<button className="inline-add" onClick={()=>onAdd()}><Plus size={17}/><span>Add a task</span><kbd>Q</kbd></button></>}
 {view==='board'&&<TaskBoard tasks={tasks} group={group==='priority'?'priority':'stage'} onAdd={initial=>onAdd({
  subject:subjectFilter||(filter==='all'?'':filter),
  due:page==='Upcoming'?day(week*7):day(),
  ...(page.startsWith('@')?{labels:[page.slice(1)]}:{}),
  ...initial,
 })} onEdit={onEdit} onLink={onLink}/>}


 </div>;
}
