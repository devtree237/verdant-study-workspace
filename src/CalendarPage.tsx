import TaskCalendar from './TaskCalendar';
import type { Task } from './model';
import type { TaskDraft } from './Tasks';
import { useStore } from './store';

export default function CalendarPage({search,onAdd,onEdit,onLink,onProfile,onNavigate}:{search:string;onAdd:(initial?:TaskDraft)=>void;onEdit:(task:Task)=>void;onLink:(type:'resource'|'mistake',id:string)=>void;onProfile?:()=>void;onNavigate?:(page:string)=>void}){
 const {data}=useStore();
 return <div className="calendar-page-content"><TaskCalendar tasks={data.tasks} search={search} onAdd={onAdd} onEdit={onEdit} onLink={onLink} onProfile={onProfile} onNavigate={onNavigate} initialWorkTrayOpen={false} fullPage/></div>;
}
