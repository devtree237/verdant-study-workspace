import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Archive, ArrowUpRight, CalendarDays, Check, CheckCheck, ChevronDown, Clock3, Search } from 'lucide-react';
import { day } from './model';
import type { TaskHistoryEntry } from './model';
import { createHistoryFollowUp, getTaskHistoryRecords, measuredTaskSeconds, taskCompletionDay } from './task-history';
import { useStore } from './store';
import { Empty, Flip, duration, gsap, useGSAP } from './ui';
import { StudyIllustration } from './StudyIllustration';
import './task-history.css';

const elapsed=(seconds:number)=>seconds<60?`${Math.floor(seconds)} sec`:`${Math.floor(seconds/60)}m${seconds%60?` ${Math.floor(seconds%60)}s`:''}`;
function groupLabel(date:string){if(date==='unknown')return 'Completion date not recorded';const full=new Date(date+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});return `${date===day()?'Today — ':date===day(-1)?'Yesterday — ':''}${full}`;}
export function History({search=''}:{search?:string}){
 const {data,update,notify}=useStore(),root=useRef<HTMLDivElement>(null);
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[collapsed,setCollapsed]=useState<Set<string>>(new Set());
 const records=useMemo(()=>getTaskHistoryRecords(data),[data.tasks,data.taskHistory]);
 const subjectName=(task:TaskHistoryEntry)=>data.subjects.find(subject=>subject.id===task.subject)?.name||task.subjectName||(task.subject?'Removed subject':'Personal');
 const subjectColor=(task:TaskHistoryEntry)=>data.subjects.find(subject=>subject.id===task.subject)?.color||task.subjectColor||'purple';
 const subjects=[...new Map(records.map(task=>[task.subject,{id:task.subject,name:subjectName(task),color:subjectColor(task)}])).values()];
 const visible=records.filter(task=>(filter==='all'||task.subject===filter)&&`${task.title} ${task.notes} ${task.labels.join(' ')} ${subjectName(task)}`.toLowerCase().includes(`${search} ${query}`.trim().toLowerCase()));
 const grouped=new Map<string,TaskHistoryEntry[]>();for(const task of visible){const date=taskCompletionDay(task);grouped.set(date,[...(grouped.get(date)||[]),task]);}
 const groups=[...grouped].sort(([a],[b])=>a==='unknown'?1:b==='unknown'?-1:b.localeCompare(a));
 const measured=visible.map(task=>measuredTaskSeconds(task)).filter((value):value is number=>value!==undefined),total=measured.reduce((sum,value)=>sum+value,0);
 const {contextSafe}=useGSAP({scope:root});
 const reflow=contextSafe((fn:()=>void)=>{const state=Flip.getState(root.current?.querySelectorAll('.task-history-entry,.task-history-group')||[]);flushSync(fn);Flip.from(state,{duration:duration(.36),ease:'power3.out',absolute:true,fade:true});gsap.fromTo('.task-history-entry',{y:14,opacity:0},{y:0,opacity:1,duration:duration(.3),stagger:duration(.03),ease:'power2.out',clearProps:'transform,opacity'});});
 function followUp(task:TaskHistoryEntry){let id='';update(state=>{const next=createHistoryFollowUp(state,task.id);if(next!==state)id=next.tasks[0].id;return next;});if(id)notify('A new follow-up task was added. This completion stays in History.',()=>update(state=>({...state,tasks:state.tasks.filter(item=>item.id!==id)})));}
 return <div className="task-history" ref={root}><div className="task-history-intro"><StudyIllustration variant="history" className="history-intro-art" size={132} /><div><h2>Progress worth keeping.</h2><p>Completed work stays here, including your four most recent board cards. Planned durations never count as measured study time.</p></div></div><dl className="task-history-summary" aria-label="Task history totals">
  <div className="history-metric">
   <dt><CheckCheck size={16} aria-hidden="true"/>Completed tasks</dt>
   <dd>{visible.length}</dd>
  </div>
  <div className="history-metric history-metric-time">
   <dt><Clock3 size={16} aria-hidden="true"/>Tracked task time</dt>
   <dd>{elapsed(total)}<small>{measured.length} measured · {visible.length-measured.length} unmeasured</small></dd>
  </div>
  <div className="history-metric">
   <dt><CalendarDays size={16} aria-hidden="true"/>Study days recorded</dt>
   <dd>{groups.filter(([date])=>date!=='unknown').length}<small>Based on completion dates</small></dd>
  </div>
 </dl>
 <div className="task-history-controls"><div className="task-history-subjects" aria-label="Filter task history by subject"><button aria-pressed={filter==='all'} className={filter==='all'?'active':''} onClick={()=>reflow(()=>setFilter('all'))}>All subjects<span>{records.length}</span></button>{subjects.map(subject=><button key={subject.id} aria-pressed={filter===subject.id} className={filter===subject.id?'active':''} onClick={()=>reflow(()=>setFilter(subject.id))}><i className={`subject-dot tone-${subject.color}`}/>{subject.name}<small>{elapsed(records.filter(task=>task.subject===subject.id).reduce((sum,task)=>sum+(measuredTaskSeconds(task)||0),0))} tracked</small></button>)}</div><label className="task-history-search"><Search size={14}/><input aria-label="Search completed task history" placeholder="Search completed work" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
 {groups.length?groups.map(([date,tasks])=>{const values=tasks.map(task=>measuredTaskSeconds(task)),known=values.filter((value):value is number=>value!==undefined),seconds=known.reduce((sum,value)=>sum+value,0),closed=collapsed.has(date);return <section className="task-history-group" key={date}><button className="task-history-date" aria-expanded={!closed} onClick={()=>reflow(()=>setCollapsed(previous=>{const next=new Set(previous);if(next.has(date))next.delete(date);else next.add(date);return next;}))}><ChevronDown size={15} className={closed?'closed':''}/><CalendarDays size={14}/><h3>{groupLabel(date)}</h3><span>{tasks.length} completed</span><small><Clock3 size={12}/>{elapsed(seconds)} tracked{known.length<tasks.length?` · ${tasks.length-known.length} unmeasured`:''}</small></button>{!closed&&<div className="task-history-entries">{tasks.map(task=><article className="task-history-entry" key={task.id}><span className="history-task-check"><Check size={14}/></span><div className="history-task-copy"><h4>{task.title}</h4><div><span className={`history-subject tone-${subjectColor(task)}`}><i className="subject-dot"/>{subjectName(task)}</span>{task.labels.map(label=><span className="history-task-label" key={label}>{label}</span>)}{task.recurring&&<span>Recurring occurrence</span>}</div></div><span className="history-task-time"><Clock3 size={12}/>{measuredTaskSeconds(task)===undefined?'Time not measured':elapsed(measuredTaskSeconds(task)!)}</span><button className="history-follow-up" onClick={()=>followUp(task)} aria-label={`Create a follow-up for ${task.title}`}>Study again<ArrowUpRight size={13}/></button></article>)}</div>}</section>;}):<Empty illustration="history" title={records.length?'No matching history':'Your effort will live here'} description={records.length?'Try a different search or subject.':'Complete a task to start your record. Older completed board cards are archived here automatically.'}/>}
 <p className="task-history-note"><Archive size={13}/>Saved in this browser’s IndexedDB. Use the workspace export to keep an independent backup.</p></div>;
}
export default History;
