import { SmoothSelect } from './components/ui/SmoothSelect';
import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { Leaf, Inbox, CalendarDays, CalendarRange, ListFilter, BookOpen, FolderOpen, ChartNoAxesCombined, Plus, Search, Bell, CircleHelp, ChevronRight, ArrowRight, ArrowUpRight, Play, Pause, RotateCcw, Check, CheckCheck, Clock3, Target, Sparkles, Sun, Download, Ellipsis, Folder, ClipboardList } from 'lucide-react';
import type { Task, Mistake, Resource, Subject } from './model';
import { day, dateLabel, uid } from './model';
import { Provider, useStore } from './store';
import { Brand, Empty, Gauge, Modal, Progress, SectionHeading, SubjectBadge, Toast, gsap, useGSAP, duration, CountUp, TimerDigits } from './ui';
import { TaskForm, Tasks } from './Tasks';
import type { TaskDraft } from './Tasks';
import { MistakeForm, Mistakes } from './Mistakes';
import { FolderForm, Quiz, ResourceForm, ResourceViewer, Vault } from './Vault';
import type { QuizTarget } from './Vault';
import { useWorkspaceMotion, useDropdownMotion } from './motion';
import { MessageCircle, Moon, History as HistoryIcon } from 'lucide-react';
import { useThemeMode, type ThemeMode } from './theme-mode';
import { ApiConfigProvider } from './ApiConfigContext';
import { ApiSettingsPanel } from './ApiSettingsPanel';
import { currentWorkspaceRoute } from './cbt-routing';
import './test-analysis.css';
import { History } from './History';
import { getTaskHistoryRecords, taskCompletionDay } from './task-history';
import { StudyIllustration } from './StudyIllustration';
import './workspace-layout.css';
import './dedicated-pages.css';
import './workspace-dock.css';
const TestCentre=lazy(()=>import('./Testing'));
const StudyChat=lazy(()=>import('./components/ui/animated-ai-chat'));
const CalendarPage=lazy(()=>import('./CalendarPage'));

function useFocusTimer(){
 const{update,notify}=useStore();const[seconds,setSeconds]=useState(()=>{try{return Number(localStorage.getItem('verdant.timer.remaining'))||1500;}catch{return 1500;}});const[end,setEnd]=useState<number|null>(()=>{try{return Number(localStorage.getItem('verdant.timer.end'))||null;}catch{return null;}});const[mode,setMode]=useState(()=>{try{return Number(localStorage.getItem('verdant.timer.mode'))||25;}catch{return 25;}});const callback=useRef({update,notify});callback.current={update,notify};
 useEffect(()=>{try{localStorage.setItem('verdant.timer.remaining',String(seconds));localStorage.setItem('verdant.timer.mode',String(mode));if(end)localStorage.setItem('verdant.timer.end',String(end));else localStorage.removeItem('verdant.timer.end');}catch{/* Timer can operate in memory. */}},[seconds,end,mode]);
 useEffect(()=>{if(!end)return;const tick=()=>{const remaining=Math.max(0,Math.ceil((end-Date.now())/1000));setSeconds(remaining);if(!remaining){setEnd(null);callback.current.update(s=>({...s,focusMinutes:s.focusMinutes+mode,focusLog:[...s.focusLog,{date:day(),minutes:mode}]}));callback.current.notify('Focus session complete. Take a breath.');setSeconds(mode*60);}};tick();const timer=setInterval(tick,500);return()=>clearInterval(timer);},[end,mode]);
 return {seconds,running:!!end,toggle:()=>end?setEnd(null):setEnd(Date.now()+seconds*1000),reset:()=>{setEnd(null);setSeconds(mode*60);},mode,setMode:(minutes:number)=>{setMode(minutes);setEnd(null);setSeconds(minutes*60);}};
}
type Timer=ReturnType<typeof useFocusTimer>;
function FocusCard({timer,large=false}:{timer:Timer;large?:boolean}){return <section className={`focus-card ${large?'focus-large':''} ${timer.running?'is-running':''}`}><div className="flex items-center justify-between"><h2><span className="tiny-spark"><Sparkles size={14}/></span>Time to focus</h2><span className="mono text-[10px]">POMODORO</span></div><p>One task. Your undivided attention.</p><div className="focus-clock"><TimerDigits value={`${String(Math.floor(timer.seconds/60)).padStart(2,'0')}:${String(timer.seconds%60).padStart(2,'0')}`}/></div><div className="focus-session-options">{[25,45,60].map(m=><button key={m} className={timer.mode===m?'active':''} onClick={()=>timer.setMode(m)} aria-pressed={timer.mode===m}>{m} min</button>)}</div><div className="flex gap-2 mt-4"><button className="button primary flex-1" onClick={timer.toggle}>{timer.running?<Pause size={14}/>:<Play size={14} fill="currentColor"/>}{timer.running?'Pause session':'Start focus'}</button><button className="button secondary square" aria-label="Reset focus timer" onClick={timer.reset}><RotateCcw size={15}/></button></div><div className="focus-caption"><span className="status-dot green"/>A small commitment. A meaningful difference.</div></section>;}
function FocusPage({timer}:{timer:Timer}){return <div className="focus-page"><header className="focus-page-heading"><StudyIllustration variant="focus" className="focus-page-art"/><span className="eyebrow">FOCUS SESSION</span><h1>Focus</h1><p>Make space for one thing at a time.</p></header><div className="focus-page-timer"><FocusCard timer={timer} large/></div><p className="focus-page-note"><Clock3 size={14}/>Your session keeps running while you move around Verdant.</p></div>;}
function Analytics({onAssess,onTest}:{onAssess:(target:QuizTarget)=>void;onTest:()=>void}){const{data}=useStore();const completed=getTaskHistoryRecords(data).length;const avg=data.resources.length?Math.round(data.resources.reduce((n,r)=>n+r.mastery,0)/data.resources.length):0;return <div><div className="analytics-hero"><div><span className="eyebrow">PROGRESS THAT ADDS UP</span><h2>See how far you’re growing.</h2><p>Small sessions and honest self-checks build lasting knowledge.</p></div><StudyIllustration variant="analytics" className="feature-banner-art"/><Gauge value={avg} size={120}/></div><div className="analytics-stats">{[{label:'Tasks completed',value:completed,icon:CheckCheck},{label:'Focused minutes',value:data.focusMinutes,icon:Clock3},{label:'Mistakes mastered',value:data.mistakes.filter(m=>m.status==='Mastered').length,icon:Sparkles},{label:'Assessments taken',value:data.assessments.length,icon:Target}].map(({label,value,icon:Icon})=><div key={label}><Icon size={18}/><b><CountUp value={value}/></b><span>{label}</span></div>)}</div><div className="analytics-grid"><section className="analytics-panel"><SectionHeading title="Subject mastery"/><p className="text-xs text-slate-500 mb-6">Check your confidence. Choose your next challenge.</p>{data.subjects.map(s=>{const material=data.resources.filter(r=>r.subject===s.id);const mastery=material.length?Math.round(material.reduce((n,r)=>n+r.mastery,0)/material.length):0;return <div className="subject-mastery-row" key={s.id}><div><SubjectBadge id={s.id}/><b>{mastery}%</b></div><Progress value={mastery}/><button className="text-link" onClick={()=>onAssess({title:`${s.name} foundations`,subject:s.id,folderId:data.folders.find(f=>f.subject===s.id&&!f.parent)?.id,questions:material.find(r=>r.questions?.length)?.questions||[]})}>Start assessment<ArrowRight size={13}/></button></div>;})}</section><section className="analytics-panel"><SectionHeading title="Your week in focus"/><p className="text-xs text-slate-500 mb-5">Minutes of completed focus sessions</p><WeeklyFocusChart log={data.focusLog}/><p className="text-xs text-slate-500 mt-4">Focus time appears here after each completed session.</p></section></div><div className="analytics-test-link"><div><h3>Practice under exam conditions</h3><p>Build timed papers and explore question, time, and cohort analysis.</p></div><button className="button tonal" onClick={onTest}><ClipboardList size={15}/>Open Test Centre<ArrowRight size={14}/></button></div><section className="analytics-panel mt-6"><SectionHeading title="Assessment history" count={data.assessments.length}/>{data.assessments.length?data.assessments.map(a=><div className="history-row" key={a.id}><div className="history-icon"><Target size={18}/></div><span><b>{a.title}</b><small>{new Date(a.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span><SubjectBadge id={a.subject}/><b className="text-emerald-700 ml-auto mono">{a.score}%</b></div>):<Empty illustration="analytics" title="Your first check-in starts here" description="Take an assessment to see your progress over time."/>}</section></div>;}
function WeeklyFocusChart({log}:{log:{date:string;minutes:number}[]}){const ref=useRef<HTMLDivElement>(null);const days=Array.from({length:7},(_,i)=>{const date=day(i-6);return {date,label:new Date(date+'T12:00:00').toLocaleDateString('en',{weekday:'short'}),minutes:log.filter(l=>l.date===date).reduce((n,l)=>n+l.minutes,0)};});const maximum=Math.max(60,Math.ceil(Math.max(...days.map(d=>d.minutes))/60)*60);useGSAP(()=>{gsap.fromTo('.chart-bar',{scaleY:0},{scaleY:1,transformOrigin:'bottom',duration:duration(.8),stagger:.035,ease:'botanical.out'});},{scope:ref,dependencies:[JSON.stringify(days)],revertOnUpdate:true});return <div className="weekly-chart" ref={ref} role="img" aria-label={days.map(d=>d.label+': '+d.minutes+' minutes').join(', ')}><div className="chart-grid" aria-hidden="true">{[...new Set([0,15,30,60,maximum])].map(minutes=><div key={minutes} className="chart-grid-line" style={{bottom:(minutes/maximum*100)+'%'}}><span>{minutes}m</span></div>)}</div>{days.map(d=><div key={d.date} className="chart-column" data-minutes={d.minutes}><span><CountUp value={d.minutes}/></span><div className="chart-bar" style={{height:Math.max(0,d.minutes/maximum*130),minHeight:d.minutes?3:0}}/><small>{d.label}</small></div>)}</div>;}
function SubjectForm({onClose,onCreated}:{onClose:()=>void;onCreated?:()=>void}){const{data,update,notify}=useStore();const[name,setName]=useState('');const[color,setColor]=useState<Subject['color']>('green');const[error,setError]=useState('');return <Modal title="Make room for a new subject" onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(!name.trim())return;if(data.subjects.some(s=>s.name.toLowerCase()===name.trim().toLowerCase())){setError('That subject already exists.');return;}const id=name.trim().toLowerCase().replace(/\s+/g,'-')+'-'+uid().slice(0,4);update(s=>({...s,subjects:[...s.subjects,{id,name:name.trim(),color}],folders:[...s.folders,{id:uid(),name:name.trim(),subject:id,parent:null,pinned:false,mastery:0}]}));notify('Subject and resource folder created');onCreated?.();onClose();}}><div className="modal-body space-y-4"><label>Subject name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Computer Science"/></label><label>Subject color<SmoothSelect value={color} onChange={e=>setColor(e.target.value as Subject['color'])}><option value="green">Emerald</option><option value="blue">Blue</option><option value="orange">Amber</option><option value="purple">Lavender</option></SmoothSelect></label>{error&&<p className="form-error">{error}</p>}</div><footer className="modal-footer"><button className="button primary">Add subject<Plus size={15}/></button></footer></form></Modal>;}
function Settings({onClose,onChat,theme,onToggleTheme}:{onClose:()=>void;onChat:()=>void;theme:ThemeMode;onToggleTheme:()=>void}){
 const{data,notify}=useStore();const[name,setName]=useState(()=>{try{return localStorage.getItem('verdant.name')||'My profile';}catch{return 'My profile';}});
 function saveProfile(){try{localStorage.setItem('verdant.name',name.trim()||'My profile');notify('Profile updated');onClose();}catch{notify('Your profile could not be saved in this browser.');}}
 function exportData(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`verdant-study-data-${day()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Study data exported. Uploaded files are not included.');}
 return <Modal title="Profile & API settings" onClose={onClose} wide><div className="modal-body workspace-settings-body"><label>Your name<input value={name} onChange={e=>setName(e.target.value)}/></label><div className="workspace-settings-actions"><button className="button primary" onClick={saveProfile}>Save profile<Check size={15}/></button><button className="button tonal" onClick={onChat}><MessageCircle size={16}/>Open Study Chat<ArrowRight size={14}/></button><button className="button secondary" onClick={onToggleTheme}>{theme==='dark'?<Sun size={16}/>:<Moon size={16}/>}Use {theme==='dark'?'light':'dark'} theme</button></div><ApiSettingsPanel/><div className="settings-note"><Leaf size={21}/><div><h3>Yours, right here.</h3><p>Study data and uploaded materials stay in this browser. You can export a copy or configure a backup endpoint above.</p></div></div><section className="workspace-export"><button className="button secondary" onClick={exportData}><Download size={16}/>Export study data</button><p>The export includes tasks, notes, mistakes, and results. Keep separate copies of uploaded files.</p></section></div></Modal>;
}

function Workspace(){
 const{data,notify,storageError,storageMessage}=useStore();const[page,setPage]=useState(()=>currentWorkspaceRoute(location.hash));const[navigationOpen,setNavigationOpen]=useState(false);const[search,setSearch]=useState('');const[view,setView]=useState('list');const[taskModal,setTaskModal]=useState<{task?:Task;initial?:TaskDraft}|null>(null);const[mistakeModal,setMistakeModal]=useState<{mistake?:Mistake;initial?:Partial<Mistake>}|null>(null);const[resourceModal,setResourceModal]=useState<{resource?:Resource;initialUpload?:boolean}|null>(null);const[folderModal,setFolderModal]=useState(false);const[subjectModal,setSubjectModal]=useState(false);const[settings,setSettings]=useState(false);const[help,setHelp]=useState(false);const[notifications,setNotifications]=useState(false);const[folder,setFolder]=useState<string|null>(null);const[folderTree,setFolderTree]=useState(true);const[expandedSubjects,setExpandedSubjects]=useState<string[]>([]);const[selectedMistake,setSelectedMistake]=useState<string|undefined>();const[openResource,setOpenResource]=useState<string|null>(null);const[quiz,setQuiz]=useState<QuizTarget|null>(null);const ref=useRef<HTMLDivElement>(null);const timer=useFocusTimer();
 const{theme,toggleTheme}=useThemeMode();
 const[searchOpen,setSearchOpen]=useState(false);
 const openBoardRequested=useRef(false);
 const[nextAction,setNextAction]=useState<'resource'|'upload'|'mistake'|'folder'|null>(null);
 useWorkspaceMotion(ref);
 useDropdownMotion();
 function requestNew(kind:'resource'|'upload'|'mistake'|'folder'){if(!data.subjects.length){setNextAction(kind);setSubjectModal(true);return;}if(kind==='resource'||kind==='upload')setResourceModal({initialUpload:kind==='upload'});else if(kind==='mistake')setMistakeModal({});else setFolderModal(true);}

 function navigate(next:string){next=currentWorkspaceRoute('#'+encodeURIComponent(next));setPage(next);location.hash=encodeURIComponent(next);setSearch('');setSearchOpen(false);setNavigationOpen(false);setSelectedMistake(undefined);setView('list');}
 useEffect(()=>{const change=()=>{const next=currentWorkspaceRoute(location.hash);setPage(next);setNavigationOpen(false);if(location.hash!==('#'+encodeURIComponent(next)))location.hash=encodeURIComponent(next);setSearch('');setSearchOpen(false);setView(openBoardRequested.current&&next==='Today'?'board':'list');openBoardRequested.current=false;};const openBoard=()=>{if(currentWorkspaceRoute(location.hash)==='Today'){setView('board');return;}openBoardRequested.current=true;location.hash='Today';};window.addEventListener('hashchange',change);window.addEventListener('verdant:open-task-board',openBoard);return()=>{window.removeEventListener('hashchange',change);window.removeEventListener('verdant:open-task-board',openBoard);};},[]);
 useEffect(()=>{const listener=(e:KeyboardEvent)=>{if(e.defaultPrevented)return;const target=e.target as HTMLElement;const editing=!!target.closest('input,textarea,select,[contenteditable=true],[role=combobox],[role=listbox],[role=option]');if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!document.querySelector('[role=dialog]'))setTaskModal({});}else if(!editing&&!document.querySelector('[role=dialog]')&&e.key.toLowerCase()==='q'){e.preventDefault();setTaskModal({});}else if(!editing&&e.key==='?')setHelp(true);};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[]);
 const reminded=useRef(new Set<string>());const notifyRef=useRef(notify);notifyRef.current=notify;useEffect(()=>{const tick=()=>data.tasks.forEach(t=>{if(!t.done&&t.reminder&&new Date(t.reminder).getTime()<=Date.now()&&!reminded.current.has(t.id)){reminded.current.add(t.id);notifyRef.current(`Reminder: ${t.title}`);}});tick();const id=setInterval(tick,15000);return()=>clearInterval(id);},[data.tasks]);
 const due=data.mistakes.filter(m=>m.review<=day()).length;const today=data.tasks.filter(t=>t.due&&t.due<=day());const completed=getTaskHistoryRecords(data).filter(t=>taskCompletionDay(t)===day()).length;const pending=today.filter(t=>!t.done).length;const activeSubject=data.subjects.find(s=>s.id===page);const isTasks=['Today','Inbox','Upcoming'].includes(page)||!!activeSubject||page.startsWith('@');const name=(()=>{try{return localStorage.getItem('verdant.name')||'My profile';}catch{return 'My profile';}})();const resource=data.resources.find(r=>r.id===openResource);

 function openLink(type:'resource'|'mistake',id:string){if(type==='resource'){if(!data.resources.some(r=>r.id===id)){notify('This resource was removed from the vault.');return;}setOpenResource(id);}else{if(!data.mistakes.some(m=>m.id===id)){notify('This mistake was removed from the book.');return;}navigate('Mistake Book');setSelectedMistake(id);}}
 function assessResource(r:Resource){setOpenResource(null);setQuiz({title:r.title,subject:r.subject,resourceId:r.id,questions:r.questions||[]});}
 const workspaceLinks = [
  { title: 'Inbox', Icon: Inbox, count: data.tasks.filter(t => !t.subject && !t.done).length },
  { title: 'Today', Icon: Sun, count: pending },
  { title: 'Upcoming', Icon: CalendarRange },
  { title: 'Calendar', Icon: CalendarDays },
  { title: 'Focus', Icon: Target },
  { title: 'History', Icon: HistoryIcon, count: data.taskHistory.length },
  { title: 'Filters & Labels', Icon: ListFilter },
 ];
 const studyLinks = [
  { title: 'Mistake Book', Icon: BookOpen, count: due },
  { title: 'Resource Vault', Icon: FolderOpen },
  { title: 'Study Chat', Icon: MessageCircle },
  { title: 'Test Centre', Icon: ClipboardList },
  { title: 'Assessment & Analytics', Icon: ChartNoAxesCombined },
 ];
 type NavLink = typeof workspaceLinks[number];
 const compactLinks = ['Today', 'Calendar', 'Test Centre'];
 const standardLinks = [...compactLinks, 'Resource Vault', 'Study Chat'];
 function dockLink({ title, Icon, count }: NavLink) {
  const isHistory = title === 'History';
  return <button
   key={title}
   className={`nav-item dock-button ${page === title ? 'active' : ''}`}
   aria-label={title}
   aria-current={page === title ? 'page' : undefined}
   data-history-nav={isHistory || undefined}
   data-dock-tier={compactLinks.includes(title) ? 'compact' : standardLinks.includes(title) ? 'standard' : 'full'}
   onClick={() => navigate(title)}
  >
   <Icon size={19} aria-hidden="true"/>
   {!!count && <span className="dock-count" aria-hidden="true" data-history-badge={isHistory || undefined}>{count > 99 ? '99+' : count}</span>}
   <span className="dock-label" aria-hidden="true">{title}</span>
  </button>;
 }
 function drawerLink({ title, Icon, count }: NavLink) {
  return <button
   key={title}
   className={`nav-item workspace-drawer-link ${page === title ? 'active' : ''}`}
   aria-current={page === title ? 'page' : undefined}
   onClick={() => navigate(title)}
  >
   <Icon size={18} aria-hidden="true"/>
   <span>{title}</span>
   {!!count && <span className="nav-count">{count}</span>}
  </button>;
 }
 function openFolder(id: string) {
  navigate('Resource Vault');
  setFolder(id);
 }
 const dateString=new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'});
 const profileInitials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase() || 'V';
 const canSearch = isTasks || ['History', 'Mistake Book', 'Resource Vault', 'Test Centre', 'Filters & Labels'].includes(page);
 const themeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

 return <div className={`app-shell has-workspace-dock ${page === 'Calendar' ? 'is-calendar-workspace' : ''} ${page === 'Study Chat' ? 'is-chat-workspace' : ''}`} ref={ref}>
  {page !== 'Calendar' && <aside className="workspace-dock" aria-label="Workspace dock">
    <button className="dock-button dock-create" aria-label="Quick add task" onClick={() => setTaskModal({})}>
     <Plus size={22} aria-hidden="true"/>
     <span className="dock-label" aria-hidden="true">Quick add task <kbd>Q</kbd></span>
    </button>
    <span className="dock-divider" aria-hidden="true"/>
    <nav className="sidebar-nav workspace-dock-links" aria-label="Main navigation">
     {workspaceLinks.map(dockLink)}
     <span className="dock-divider" aria-hidden="true"/>
     {studyLinks.map(dockLink)}
    </nav>
    <span className="dock-divider" aria-hidden="true"/>
    <div className="workspace-dock-actions">
     {canSearch && <button className={`dock-button ${search ? 'dock-button-engaged' : ''}`} aria-label="Search this view" aria-haspopup="dialog" aria-expanded={searchOpen} onClick={() => setSearchOpen(true)}>
      <Search size={18} aria-hidden="true"/>
      {search && <span className="dock-dot" aria-hidden="true"/>}
      <span className="dock-label" aria-hidden="true">Search this view</span>
     </button>}
     <button className="dock-button dock-theme" aria-label={themeLabel} onClick={toggleTheme}>
      {theme === 'dark' ? <Sun size={18} aria-hidden="true"/> : <Moon size={18} aria-hidden="true"/>}
      <span className="dock-label" aria-hidden="true">{themeLabel}</span>
     </button>
     <button className="dock-button dock-utility" aria-label="Open review reminders" aria-haspopup="dialog" onClick={() => setNotifications(true)}>
      <Bell size={18} aria-hidden="true"/>
      {due > 0 && <span className="dock-dot" aria-hidden="true"/>}
      <span className="dock-label" aria-hidden="true">Review reminders</span>
     </button>
     <button className="dock-button dock-utility" aria-label="Help and keyboard shortcuts" aria-haspopup="dialog" onClick={() => setHelp(true)}>
      <CircleHelp size={18} aria-hidden="true"/>
      <span className="dock-label" aria-hidden="true">Help and shortcuts</span>
     </button>
     <button className="dock-button dock-utility" aria-label="Open profile and workspace settings" aria-haspopup="dialog" onClick={() => setSettings(true)}>
      <span className="dock-avatar" aria-hidden="true">{profileInitials}</span>
      <span className="dock-label" aria-hidden="true">Profile and settings</span>
     </button>
     <button className="dock-button dock-more" aria-label="More workspace options" aria-haspopup="dialog" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(true)}>
      <Ellipsis size={21} aria-hidden="true"/>
      <span className="dock-label" aria-hidden="true">More</span>
     </button>
    </div>
   </aside>}
  <div className="main-shell"><main className={page==='Study Chat'?'chat-page':page==='Calendar'?'calendar-page':page==='Focus'?'focus-route-page':undefined}>{!['Study Chat','Calendar','Focus'].includes(page)&&<div className="page-heading"><div><div className="page-eyebrow"><Sun size={14}/>{page==='Today'?dateString:page==='Mistake Book'?'REFLECT · RECALL · REMEMBER':page==='Resource Vault'?'COLLECT · CONNECT · UNDERSTAND':page==='Study Chat'?'ASK · EXPLORE · UNDERSTAND':page==='Test Centre'?'PRACTICE · MEASURE · IMPROVE':page==='Assessment & Analytics'?'YOUR LEARNING, IN PERSPECTIVE':'YOUR SPACE TO MAKE PROGRESS'}</div><h1>{activeSubject?.name||page}{page==='Today'&&<span className="heading-dot">.</span>}</h1><p>{page==='Today'?'A little progress, every day. Let’s make room for what matters.':page==='Mistake Book'?'Good learning starts with knowing what you don’t know.':page==='Resource Vault'?'Everything you need, and everything you’re learning.':page==='History'?'Your completed work, organized by day and subject.':page==='Study Chat'?'A dedicated space to think things through with your chosen AI.':page==='Test Centre'?'Your questions. Real attempts. A clearer plan for the next test.':page==='Assessment & Analytics'?'A thoughtful look at your effort, confidence, and growth.':page==='Upcoming'?'A little intention now. A calmer week ahead.':page==='Inbox'?'Capture the thought. Find its place later.':page==='Filters & Labels'?'Find the right work for the moment.':'Your ideas, practice, and progress in one place.'}</p></div><div className="page-heading-actions">{isTasks?<><button className="button primary" onClick={()=>setTaskModal({initial:activeSubject?{subject:activeSubject.id}:undefined})}><Plus size={16}/>Add task</button></>:page==='Mistake Book'?<button className="button primary" onClick={()=>requestNew('mistake')}><Plus size={16}/>Log mistake</button>:page==='Resource Vault'?<button className="button primary" onClick={()=>requestNew('resource')}><Plus size={16}/>Add resource</button>:null}</div></div>}{storageError&&<div role="alert" className="storage-warning">Your browser couldn’t save the latest changes. Free some storage and export your study data in Workspace settings.</div>}<div className="page-body">{isTasks?<div className="task-workspace full-width"><div className="task-main">{page==='Today'&&<div className="daily-progress"><StudyIllustration variant="growth" className="daily-illustration"/><div className="daily-progress-copy"><h2>You’re growing at your own pace.</h2><p>{completed?`${completed} done. Keep that quiet momentum going.`:`${pending} tasks ahead. Start with one small win.`}</p></div><div className="daily-progress-meter"><span><b>{completed}</b> / {pending+completed} complete</span><Progress value={pending+completed?completed/(pending+completed)*100:0}/></div></div>}<Tasks key={page} view={view} page={activeSubject?'subject':page} search={search} subjectFilter={activeSubject?.id||''} onAdd={initial=>setTaskModal({initial:{subject:activeSubject?.id,...initial}})} onEdit={task=>setTaskModal({task})} onLink={openLink} onViewChange={setView}/><div className="tasks-footnote"><CheckCheck size={14}/><span>{getTaskHistoryRecords(data).filter(t=>taskCompletionDay(t)===day()).length} completed today</span><span className="ml-auto hidden sm:block">Quick add <kbd>Q</kbd> or <kbd>Ctrl K</kbd></span></div></div></div>:page==='Calendar'?<Suspense fallback={<p className="route-loading" role="status">Opening your calendar…</p>}><CalendarPage onProfile={()=>setSettings(true)} onNavigate={navigate} search={search} onAdd={initial=>setTaskModal({initial})} onEdit={task=>setTaskModal({task})} onLink={openLink}/></Suspense>:page==='Focus'?<FocusPage timer={timer}/>:page==='History'?<History search={search}/>:page==='Mistake Book'?<Mistakes search={search} onSearchChange={setSearch} selectedId={selectedMistake} clearSelection={()=>setSelectedMistake(undefined)} onAdd={()=>requestNew('mistake')} onEdit={mistake=>setMistakeModal({mistake})}/>:page==='Resource Vault'?<Vault search={search} folder={folder} onFolder={setFolder} onOpen={setOpenResource} onAdd={()=>requestNew('resource')} onUpload={()=>requestNew('upload')} onNewFolder={()=>requestNew('folder')} onAssess={setQuiz} onEdit={r=>setResourceModal({resource:r})}/>:page==='Study Chat'?<Suspense fallback={<div className="settings-note" role="status">Opening your chat workspace…</div>}><StudyChat/></Suspense>:page==='Test Centre'?<Suspense fallback={<div className="settings-note" role="status">Opening your test workspace…</div>}><TestCentre search={search}/></Suspense>:page==='Assessment & Analytics'?<Analytics onAssess={setQuiz} onTest={()=>navigate('Test Centre')}/>:page==='Filters & Labels'?<div className="labels-grid">{!data.tasks.some(t=>t.labels.length)&&<Empty illustration="labels" title="Your labels will live here" description="Add @labels when you create tasks to organize your own study workflow." action={<button className="button primary" onClick={()=>setTaskModal({})}>Add a task<Plus size={15}/></button>}/>} {[...new Set(data.tasks.flatMap(t=>t.labels))].filter(l=>l.toLowerCase().includes(search.toLowerCase())).map(label=><button className="label-card" key={label} onClick={()=>navigate('@'+label)}><StudyIllustration variant="labels" size={64} className="label-card-art"/><div><h2>{label}</h2><p>{data.tasks.filter(t=>t.labels.includes(label)&&!t.done).length} active tasks</p></div><ArrowUpRight size={16}/></button>)}</div>:<Empty title="Find your next step" description="This view is no longer available." action={<button className="button primary" onClick={()=>navigate('Today')}>Go to Today</button>}/>}</div>{!['Study Chat','Calendar','Focus'].includes(page)&&<footer className="workspace-footer"><Brand small/><span>A little more focused. A little more you.</span><span className="ml-auto"><span className="status-dot green"/>Saved on this device</span></footer>}</main></div>
 {navigationOpen && <Modal title="Workspace navigation" onClose={() => setNavigationOpen(false)}>
  <nav className="workspace-nav-drawer" aria-label="All workspace pages">
   <div className="workspace-drawer-intro">
    <button className="button primary" onClick={() => { setNavigationOpen(false); setTaskModal({}); }}><Plus size={16}/>Quick add task</button>
   </div>
   <div className="workspace-drawer-group workspace-drawer-tools">
    <span className="nav-section-label">Workspace tools</span>
    {canSearch && <button className="nav-item workspace-drawer-link" onClick={() => { setNavigationOpen(false); setSearchOpen(true); }}><Search size={17}/>Search this view</button>}
    <button className="nav-item workspace-drawer-link" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>} {themeLabel}</button>
    <button className="nav-item workspace-drawer-link" onClick={() => { setNavigationOpen(false); setNotifications(true); }}><Bell size={17}/>Review reminders{!!due && <span className="nav-count">{due}</span>}</button>
    <button className="nav-item workspace-drawer-link" onClick={() => { setNavigationOpen(false); setSettings(true); }}><span className="dock-avatar" aria-hidden="true">{profileInitials}</span>Profile and settings</button>
    <button className="nav-item workspace-drawer-link" onClick={() => { setNavigationOpen(false); setHelp(true); }}><CircleHelp size={17}/>Help and keyboard shortcuts</button>
   </div>
   <div className="workspace-drawer-group">
    <span className="nav-section-label">Workspace</span>
    {workspaceLinks.map(drawerLink)}
   </div>
   <div className="workspace-drawer-group">
    <span className="nav-section-label">Study hub</span>
    {studyLinks.map(link => <div key={link.title}>
     {drawerLink(link)}
     {link.title === 'Resource Vault' && page === 'Resource Vault' && data.folders.length > 0 && <div className="sidebar-folder-tree">
      <button className="tree-toggle" aria-expanded={folderTree} onClick={() => setFolderTree(!folderTree)}><ChevronRight size={12} className={folderTree ? 'rotate-90' : ''}/>Folders</button>
      {folderTree && data.folders.filter(f => !f.parent).map(f => <div key={f.id}>
       <button aria-current={folder === f.id ? 'location' : undefined} onClick={() => openFolder(f.id)}><Folder size={13}/>{f.name}</button>
       {data.folders.filter(child => child.parent === f.id).map(child => <button className="nested-folder" key={child.id} aria-current={folder === child.id ? 'location' : undefined} onClick={() => openFolder(child.id)}><ChevronRight size={11}/>{child.name}</button>)}
      </div>)}
     </div>}
    </div>)}
   </div>
   <div className="workspace-drawer-group">
    <div className="workspace-drawer-subjects-heading">
     <span className="nav-section-label">My subjects</span>
     <button className="icon-btn" aria-label="Add subject" onClick={() => { setNavigationOpen(false); setSubjectModal(true); }}><Plus size={15}/></button>
    </div>
    {data.subjects.map(subject => <div key={subject.id}>
     <div className={`subject-nav ${page === subject.id ? 'active' : ''}`}>
      <button className="subject-nav-main" aria-current={page === subject.id ? 'page' : undefined} onClick={() => navigate(subject.id)}>
       <span className={`subject-dot tone-${subject.color}`}/>
       <span className="workspace-subject-name">{subject.name}</span>
       <span className="nav-count">{data.tasks.filter(t => t.subject === subject.id && !t.done).length}</span>
      </button>
      <button className="subject-expand" aria-label={`${expandedSubjects.includes(subject.id) ? 'Collapse' : 'Expand'} ${subject.name}`} aria-expanded={expandedSubjects.includes(subject.id)} onClick={() => setExpandedSubjects(current => current.includes(subject.id) ? current.filter(id => id !== subject.id) : [...current, subject.id])}>
       <ChevronRight size={14} className={expandedSubjects.includes(subject.id) ? 'rotate-90' : ''}/>
      </button>
     </div>
     {expandedSubjects.includes(subject.id) && <div className="subject-subnav">
      <button onClick={() => { navigate('Resource Vault'); setFolder(data.folders.find(f => f.subject === subject.id && !f.parent)?.id || null); }}>Study materials</button>
      <button onClick={() => { navigate(subject.id); setTaskModal({ initial: { subject: subject.id } }); }}>Add a task</button>
     </div>}
    </div>)}
    {data.subjects.length === 0 && <p className="workspace-drawer-empty">Add a subject to organize your work.</p>}
   </div>
  </nav>
 </Modal>}
 {searchOpen && <Modal title="Search this view" onClose={() => setSearchOpen(false)}>
  <form className="workspace-search-form" onSubmit={event => { event.preventDefault(); setSearchOpen(false); }}>
   <div className="modal-body">
    <label>Search {activeSubject?.name || page}
     <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Type to filter this view…"/>
    </label>
   </div>
   <footer className="modal-footer">
    <button type="button" className="button secondary" onClick={() => setSearch('')} disabled={!search}>Clear search</button>
    <button type="submit" className="button primary">Done<Check size={15}/></button>
   </footer>
  </form>
 </Modal>}
 {taskModal&&<TaskForm {...taskModal} onClose={()=>setTaskModal(null)}/>} {mistakeModal&&<MistakeForm {...mistakeModal} onClose={()=>setMistakeModal(null)}/>} {resourceModal&&<ResourceForm resource={resourceModal.resource} initialUpload={resourceModal.initialUpload} folder={folder} onClose={()=>setResourceModal(null)}/>} {folderModal&&<FolderForm parent={folder} onClose={()=>setFolderModal(false)}/>} {subjectModal&&<SubjectForm onCreated={()=>{if(nextAction==='resource'||nextAction==='upload')setResourceModal({initialUpload:nextAction==='upload'});else if(nextAction==='mistake')setMistakeModal({});else if(nextAction==='folder')setFolderModal(true);}} onClose={()=>{setSubjectModal(false);setNextAction(null);}}/>} {settings&&<Settings theme={theme} onToggleTheme={toggleTheme} onClose={()=>setSettings(false)} onChat={()=>{setSettings(false);navigate('Study Chat');}}/>} {resource&&<ResourceViewer key={resource.id} resource={resource} onClose={()=>setOpenResource(null)} onAssess={()=>assessResource(resource)} onEdit={()=>{setOpenResource(null);setResourceModal({resource});}} onMistake={initial=>{setOpenResource(null);setMistakeModal({initial});}}/>} {quiz&&<Quiz target={quiz} onClose={()=>setQuiz(null)}/>}
 {help&&<Modal title="A few little shortcuts" onClose={()=>setHelp(false)}><div className="modal-body"><div className="shortcut-row"><span>Quick add a task</span><kbd>Q</kbd></div><div className="shortcut-row"><span>Open Quick Add from anywhere</span><kbd>Ctrl / ⌘ + K</kbd></div><div className="shortcut-row"><span>Close a dialog</span><kbd>Esc</kbd></div><div className="shortcut-row"><span>Show this guide</span><kbd>?</kbd></div><div className="settings-note"><Leaf size={22}/><p>Type #Physics, @revision, p1, today, tomorrow, next monday, or every day into Quick Add. Drag board cards by their grip, or use the stage selector with your keyboard.</p></div><p className="text-xs text-slate-500 mt-4">Your workspace starts empty. Add your subjects, tasks, mistakes, and materials. Your changes are saved in this browser.</p></div></Modal>}
 {notifications&&<Modal title="A gentle nudge" onClose={()=>setNotifications(false)}><div className="modal-body">{data.mistakes.filter(m=>m.review<=day()).map(m=><button key={m.id} className="notification-row" onClick={()=>{setNotifications(false);openLink('mistake',m.id);}}><BookOpen size={18}/><span><b>{m.title}</b><small>Ready for active recall · {dateLabel(m.review)}</small></span><ChevronRight size={15}/></button>)}{!due&&<Empty title="All caught up" description="There are no reviews due right now."/>}</div></Modal>}<Toast/>
 </div>;
}
export default function App(){return <Provider><ApiConfigProvider><Workspace/></ApiConfigProvider></Provider>;}
