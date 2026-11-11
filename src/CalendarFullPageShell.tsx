import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Menu, Plus, Search, Settings2, X } from 'lucide-react';
import { SmoothSelect } from './components/ui/SmoothSelect';
import { useEventCalendarNavigation, useEventCalendarView, useEventCalendarViewSettings } from './components/ui/reui-event-calendar';
import type { CalendarView } from './components/ui/reui-event-calendar-utils/event-calendar-types';
import type { Subject } from './model';
import type { TaskDraft } from './Tasks';
import { calendarDayKey } from './task-calendar';
import { Modal } from './ui';
import { useApiConfig } from './ApiConfigContext';

type Props = {
  children: ReactNode; subjects: Subject[]; hiddenSubjects: string[]; onToggleSubject: (id:string)=>void;
  query:string; onQuery:(value:string)=>void; showCompleted:boolean; onShowCompleted:(value:boolean)=>void;
  onAdd:(initial?:TaskDraft)=>void; onProfile?:()=>void; onBack?:()=>void;
};
const monthTitle=(date:Date)=>date.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
function shiftMonth(date:Date,delta:number){return new Date(date.getFullYear(),date.getMonth()+delta,1,12);}

export default function CalendarFullPageShell({children,subjects,hiddenSubjects,onToggleSubject,query,onQuery,showCompleted,onShowCompleted,onAdd,onProfile,onBack}:Props){
  const navigation=useEventCalendarNavigation(),{view,setView}=useEventCalendarView(),{viewSettings,setViewSettings,effective}=useEventCalendarViewSettings();
  const {configs,statuses}=useApiConfig();
  const [gridView,setGridView]=useState<CalendarView>(view==='agenda'?'week':view);
  const [sidebarOpen,setSidebarOpen]=useState(()=>window.innerWidth>900),[searchOpen,setSearchOpen]=useState(!!query),[help,setHelp]=useState(false),[calendarQuery,setCalendarQuery]=useState('');
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sidebarOpen && window.matchMedia('(max-width:900px)').matches) {
      sidebar.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    }
  }, [sidebarOpen]);
  const [miniMonth,setMiniMonth]=useState(()=>new Date(navigation.date.getFullYear(),navigation.date.getMonth(),1,12));
  const [today,setToday]=useState(()=>new Date());
  useEffect(()=>{setMiniMonth(new Date(navigation.date.getFullYear(),navigation.date.getMonth(),1,12));},[navigation.date.getFullYear(),navigation.date.getMonth()]);
  useEffect(()=>{if(view!=='agenda')setGridView(view);},[view]);
  useEffect(()=>{const refresh=()=>setToday(new Date());const id=window.setInterval(refresh,60000);window.addEventListener('focus',refresh);return()=>{window.clearInterval(id);window.removeEventListener('focus',refresh);};},[]);
  const dates=useMemo(()=>{const first=new Date(miniMonth.getFullYear(),miniMonth.getMonth(),1,12);first.setDate(1-first.getDay());return Array.from({length:42},(_,i)=>new Date(first.getFullYear(),first.getMonth(),first.getDate()+i,12));},[miniMonth]);
  const calendars=[{id:'',name:'Personal',color:'purple'},...subjects].filter(item=>item.name.toLowerCase().includes(calendarQuery.trim().toLowerCase()));
  const name=(()=>{try{return localStorage.getItem('verdant.name')||'My profile';}catch{return 'My profile';}})();
  function closeSidebar() {
    if (sidebar.current?.contains(document.activeElement)) menuButton.current?.focus({ preventScroll: true });
    setSidebarOpen(false);
  }
  const pickDate=(date:Date)=>{navigation.goTo(date);if(window.innerWidth<=900)closeSidebar();};
  return <div className="calendar-full-shell" onKeyDown={event => {
    if (event.key !== 'Escape' || !sidebarOpen || event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('[role="dialog"],[role="listbox"],[role="menu"]')) return;
    const isSidebarControl = sidebar.current?.contains(target) || menuButton.current?.contains(target);
    if (!isSidebarControl && !window.matchMedia('(max-width:900px)').matches) return;
    event.preventDefault();
    event.stopPropagation();
    closeSidebar();
  }}>
    <header className="calendar-shell-header">
      {onBack && <button className="calendar-header-icon calendar-back" type="button" aria-label="Back to workspace" title="Back to workspace" onClick={onBack}><ArrowLeft size={18} aria-hidden="true"/><span>Back</span></button>}
      <button ref={menuButton} className="calendar-header-icon" aria-label={sidebarOpen?'Collapse calendar sidebar':'Expand calendar sidebar'} aria-expanded={sidebarOpen} aria-controls="calendar-navigation-sidebar" onClick={()=>sidebarOpen?closeSidebar():setSidebarOpen(true)}><Menu size={22}/></button>
      <div className="calendar-brand"><span className="calendar-brand-date" aria-hidden="true">{today.getDate()}</span><span>Calendar</span></div>
      <button className="calendar-header-today" onClick={navigation.today}>Today</button>
      <div className="calendar-header-period"><button className="calendar-header-icon" aria-label="Previous calendar period" onClick={navigation.prev}><ChevronLeft size={20}/></button><button className="calendar-header-icon" aria-label="Next calendar period" onClick={navigation.next}><ChevronRight size={20}/></button></div>
      <h1 className="calendar-header-month" aria-live="polite">{monthTitle(navigation.date)}</h1>
      <div className="calendar-header-tools">
        <button className="calendar-header-icon" aria-label={searchOpen?'Close calendar search':'Search calendar'} aria-expanded={searchOpen} onClick={()=>{setSearchOpen(!searchOpen);if(searchOpen)onQuery('');}}><Search size={21}/></button>
        <button className="calendar-header-icon calendar-help-button" aria-label="Calendar help" onClick={()=>setHelp(true)}><CircleHelp size={21}/></button>
        <details className="calendar-shell-settings"><summary aria-label="Calendar settings"><Settings2 size={21}/></summary><div><label><input type="checkbox" checked={effective.weekends} onChange={e=>setViewSettings({...viewSettings,weekends:e.target.checked})}/>Show weekends</label><label><input type="checkbox" checked={effective.nowIndicator} onChange={e=>setViewSettings({...viewSettings,nowIndicator:e.target.checked})}/>Current time line</label><label><input type="checkbox" checked={showCompleted} onChange={e=>onShowCompleted(e.target.checked)}/>Show completed tasks</label><button onClick={onProfile}>Profile & API settings</button></div></details>
        <label className="calendar-shell-view"><span className="sr-only">Calendar view</span><SmoothSelect aria-label="Calendar view" value={gridView} onChange={e=>setView(e.target.value as CalendarView)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></SmoothSelect></label>
        <div className="calendar-mode-pill" role="group" aria-label="Calendar or tasks"><button aria-label="Calendar view mode" aria-pressed={view!=='agenda'} onClick={()=>setView(gridView)}><CalendarDays size={19}/></button><button aria-label="Tasks view mode" aria-pressed={view==='agenda'} onClick={()=>setView('agenda')}><CheckCircle2 size={19}/></button></div>
        <button className="calendar-profile" aria-label="Open profile and API settings" title={name} onClick={onProfile}>{name.trim().charAt(0).toUpperCase()||'V'}</button>
      </div>
    </header>
    {searchOpen&&<div className="calendar-shell-search"><Search size={17}/><input autoFocus aria-label="Search calendar tasks" placeholder="Search your tasks…" value={query} onChange={e=>onQuery(e.target.value)}/>{query&&<button aria-label="Clear calendar search" onClick={()=>onQuery('')}><X size={16}/></button>}</div>}
    <div className={`calendar-shell-body ${sidebarOpen?'is-sidebar-open':''}`}>
      <button className={`calendar-sidebar-scrim ${sidebarOpen?'is-open':''}`} aria-label="Close calendar sidebar" aria-hidden={!sidebarOpen} tabIndex={-1} disabled={!sidebarOpen} onClick={closeSidebar}/>
      <div className={`calendar-sidebar-presence ${sidebarOpen?'is-open':''}`} inert={!sidebarOpen} aria-hidden={!sidebarOpen}>
      <aside ref={sidebar} id="calendar-navigation-sidebar" className="calendar-local-sidebar" aria-label="Calendar navigation">
        <button className="calendar-create" onClick={()=>onAdd({due:calendarDayKey(navigation.date),time:''})}><Plus size={27}/><span>Create</span></button>
        <section className="calendar-mini-month" aria-label="Choose calendar date"><header><h2>{monthTitle(miniMonth)}</h2><div><button aria-label="Previous mini-calendar month" onClick={()=>setMiniMonth(shiftMonth(miniMonth,-1))}><ChevronLeft size={16}/></button><button aria-label="Next mini-calendar month" onClick={()=>setMiniMonth(shiftMonth(miniMonth,1))}><ChevronRight size={16}/></button></div></header><div className="calendar-mini-weekdays" aria-hidden="true">{'SMTWTFS'.split('').map((day,i)=><span key={i}>{day}</span>)}</div><div className="calendar-mini-days">{dates.map(date=>{const key=calendarDayKey(date),isToday=key===calendarDayKey(today),selected=key===calendarDayKey(navigation.date);return <button key={key} className={`${date.getMonth()!==miniMonth.getMonth()?'is-outside':''} ${isToday?'is-today':''} ${selected?'is-selected':''}`} aria-label={date.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} aria-pressed={selected} aria-current={isToday?'date':undefined} onClick={()=>pickDate(date)}>{date.getDate()}</button>;})}</div></section>
        <label className="calendar-find-calendar"><Search size={17}/><input aria-label="Search calendars" placeholder="Search calendars" value={calendarQuery} onChange={e=>setCalendarQuery(e.target.value)}/></label>
        <details className="calendar-list-group" open><summary>My calendars<ChevronDown size={16}/></summary><div>{calendars.map(item=><label key={item.id||'personal'}><input type="checkbox" checked={!hiddenSubjects.includes(item.id)} onChange={()=>onToggleSubject(item.id)} aria-label={`Show ${item.name} calendar`} style={{accentColor:item.color==='green'?'#229767':item.color==='blue'?'#4e83df':item.color==='orange'?'#d68a3f':'#9d80f5'}}/><span>{item.name}</span></label>)}{!calendars.length&&<p>No matching calendars.</p>}</div></details>
        <details className="calendar-list-group calendar-other-group" open><summary>Other calendars<ChevronDown size={16}/></summary><div><p>{statuses.calendar.state==='connected'?'Calendar connection verified. Import events in settings to add them to your schedule.':configs.calendar.endpoint?'Calendar connection saved. Open settings to verify and import events.':'No external calendars connected.'}</p><button className="calendar-connect" onClick={onProfile}><Plus size={15}/>{configs.calendar.endpoint?'Calendar connection settings':'Connect a calendar'}</button></div></details>
      </aside>
      </div>
      <div className="calendar-shell-canvas">{children}</div>
    </div>
    {help&&<Modal title="Plan your study time" onClose={()=>setHelp(false)}><div className="modal-body calendar-help-copy"><p>Drag across empty time slots to create a task. Move a saved task to reschedule it, or pull its top or bottom edge to change its duration. Changes snap to 15 minutes.</p><p>Use the mini-calendar and Today to move between dates. My calendars filters your saved subjects. The Tasks switch shows the same scheduled work as a list.</p><p>Focus a resize handle and use ↑ or ↓ to change one edge. Press Escape to cancel a drag. Undo restores your last schedule change.</p></div><footer className="modal-footer"><button className="button primary" onClick={()=>setHelp(false)}>Got it</button></footer></Modal>}
  </div>;
}
