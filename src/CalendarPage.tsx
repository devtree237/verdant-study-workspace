import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { SmoothSelect } from './components/ui/SmoothSelect';
import TaskCalendar from './TaskCalendar';
import type { Task } from './model';
import type { TaskDraft } from './Tasks';
import { useStore } from './store';

export default function CalendarPage({search,onAdd,onEdit,onLink}:{search:string;onAdd:(initial?:TaskDraft)=>void;onEdit:(task:Task)=>void;onLink:(type:'resource'|'mistake',id:string)=>void}){
 const {data}=useStore(),[subject,setSubject]=useState('all'),[showCompleted,setShowCompleted]=useState(false);
 const tasks=useMemo(()=>data.tasks.filter(task=>(showCompleted||!task.done)&&(subject==='all'||task.subject===subject)&&(!search||(task.title+' '+task.labels.join(' ')).toLowerCase().includes(search.toLowerCase()))),[data.tasks,subject,showCompleted,search]);
 return <div className="calendar-page-content"><header className="calendar-page-heading"><h1>Calendar</h1><div className="calendar-page-filters"><label><span className="sr-only">Calendar subject</span><SmoothSelect aria-label="Calendar subject" value={subject} onChange={event=>setSubject(event.target.value)}><option value="all">All subjects</option><option value="">Personal</option>{data.subjects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</SmoothSelect></label><button className="icon-btn" aria-label="Show completed calendar tasks" aria-pressed={showCompleted} title="Show completed tasks" onClick={()=>setShowCompleted(!showCompleted)}><CheckCircle2 size={17}/></button></div></header><TaskCalendar tasks={tasks} onAdd={onAdd} onEdit={onEdit} onLink={onLink} initialWorkTrayOpen={false}/></div>;
}
