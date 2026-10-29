export type Subject = { id: string; name: string; color: 'green' | 'blue' | 'orange' | 'purple' };
export type Stage = 'To study' | 'In progress' | 'Practicing' | 'Completed';
export type Task = { id: string; title: string; subject: string; priority: number; due: string; time?: string; duration: number; labels: string[]; stage: Stage; done: boolean; completedAt?: string; recurring?: boolean; reminder?: string; notes: string; subtasks: { id: string; title: string; done: boolean }[]; link?: { type: 'resource' | 'mistake'; id: string }; measuredSeconds?: number; trackingStartedAt?: string; };
export type TaskHistoryEntry = Task & { archivedAt: string; subjectName?: string; subjectColor?: Subject['color'] };
export const categories = ['Conceptual gap', 'Formula misapplication', 'Calculation error', 'Misread question', 'Time pressure'] as const;
export type Mistake = { id: string; title: string; subject: string; topic: string; category: string; prompt: string; wrong: string; solution: string; takeaway: string; difficulty: number; mastery?: number; status: 'Needs review' | 'In progress' | 'Mastered'; review: string; attempts: number; image?: string; };
export type Folder = { id: string; name: string; parent: string | null; subject: string; pinned: boolean; mastery: number };
export type Question = { prompt: string; options: string[]; answer: number; explanation: string };
export type Resource = { id: string; title: string; folder: string; subject: string; type: 'Note' | 'PDF' | 'Document' | 'Link' | 'Quiz'; content: string; url?: string; fileKey?: string; fileName?: string; fileSize?: number; fileKind?: 'pdf' | 'docx' | 'text' | 'markdown' | 'latex'; pageCount?: number; mastery: number; pinned: boolean; updated: string; questions?: Question[] };
export type Assessment = { id: string; title: string; subject: string; score: number; date: string };
export type State = { version: number; subjects: Subject[]; tasks: Task[]; taskHistory: TaskHistoryEntry[]; mistakes: Mistake[]; folders: Folder[]; resources: Resource[]; assessments: Assessment[]; focusMinutes: number; focusLog: { date: string; minutes: number }[] };
export const uid = () => crypto.randomUUID();
export function day(offset = 0, base = new Date()): string { const d = new Date(base); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function dateLabel(date: string) { if (!date) return 'No date'; if (date === day()) return 'Today'; if (date === day(1)) return 'Tomorrow'; return new Date(date+'T12:00:00').toLocaleDateString('en-IN', { day:'numeric',month:'short' }); }
export function parseTask(input: string, subjects: Subject[], base = new Date()) {
  const subjectToken = input.match(/#([\w-]+)/)?.[1];
  const subject = subjects.find(s => s.name.toLowerCase().replace(/\s+/g,'-') === subjectToken?.toLowerCase() || s.id.toLowerCase() === subjectToken?.toLowerCase())?.id;
  const priority = Number(input.match(/\bp([1-4])\b/i)?.[1] ?? 4);
  const labels = [...input.matchAll(/@([\w-]+)/g)].map(m => m[1]);
  let due = ''; const recurring = /\bevery day\b/i.test(input);
  if (/\btoday\b/i.test(input) || recurring) due = day(0, base);
  if (/\btomorrow\b/i.test(input)) due = day(1, base);
  const weekday = input.match(/\bnext (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)?.[1];
  if (weekday) { const target = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(weekday.toLowerCase()); due = day((target-base.getDay()+7)%7 || 7, base); }
  const title = input.replace(/#[\w-]+|@[\w-]+|\bp[1-4]\b|\btoday\b|\btomorrow\b|\bevery day\b|\bnext (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,'').replace(/\s+/g,' ').trim();
  return { title, subject, priority, labels, due, recurring };
}
export function reviewResult(m: Mistake, rating: 'failed'|'effort'|'mastered'): Mistake { return { ...m, attempts:m.attempts+1, review:day(rating==='failed'?1:rating==='effort'?3:14), status:rating==='mastered'?'Mastered':'In progress' }; }
export function linkedTask(title: string, subject: string, type: 'resource'|'mistake', id: string, due=day(), priority=2): Task { return { id:uid(), title, subject, priority, due, duration:25, labels:[type==='mistake'?'mistake-review':'revision'], stage:'To study', done:false, notes:'', subtasks:[], link:{type,id} }; }
export function createEmptyState(): State { return {version:3,subjects:[],tasks:[],taskHistory:[],mistakes:[],folders:[],resources:[],assessments:[],focusMinutes:0,focusLog:[]}; }
/** Remove the first development version's fixed demo IDs while retaining user-created records. */
export function migrateStoredState(s:State):State {
 if(s.version>=3&&Array.isArray(s.taskHistory))return s;
 if(s.version>=2)return {...s,version:3,taskHistory:Array.isArray(s.taskHistory)?s.taskHistory:[]};
 const demoResources=new Set(['r1','r2','r3','r4','r5']);const demoMistakes=new Set(['m1','m2','m3','m4']);const demoFolders=new Set(['fm','fp','fc','fmc','fpe','fco']);
 const resources=s.resources.filter(r=>!demoResources.has(r.id));const mistakes=s.mistakes.filter(m=>!demoMistakes.has(m.id));
 const tasks=s.tasks.filter(t=>!/^t[1-8]$/.test(t.id)).map(t=>({...t,link:t.link&&(demoResources.has(t.link.id)||demoMistakes.has(t.link.id))?undefined:t.link}));
 const keepFolders=new Set(resources.map(r=>r.folder));s.folders.filter(f=>!demoFolders.has(f.id)).forEach(f=>keepFolders.add(f.id));for(const id of keepFolders){let f=s.folders.find(f=>f.id===id);while(f?.parent){keepFolders.add(f.parent);f=s.folders.find(p=>p.id===f!.parent);}}
 const folders=s.folders.filter(f=>keepFolders.has(f.id)).map(f=>({...f,mastery:0}));const usedSubjects=new Set([...resources,...mistakes,...tasks,...folders].map(x=>x.subject));
 const subjects=s.subjects.filter(x=>!['mathematics','physics','chemistry'].includes(x.id)||usedSubjects.has(x.id));
 return {...s,version:3,taskHistory:Array.isArray(s.taskHistory)?s.taskHistory:[],subjects,tasks,mistakes,resources,folders,assessments:s.assessments.filter(a=>!['Calculus · knowledge check','Calculus · essential formulas','Gauss’s law · concept notes','Organic reaction mechanisms','Mathematics','Physics','Chemistry'].includes(a.title))};
}

/** Reject damaged snapshots instead of replacing them with an empty workspace. */
export function validateWorkspaceState(value: unknown): State {
 if(!value||typeof value!=='object')throw new Error('The workspace snapshot is not an object.');
 const raw=value as Record<string,unknown>;
 if(![1,2,3].includes(Number(raw.version)))throw new Error('This workspace version is not supported.');
 for(const key of ['subjects','tasks','mistakes','folders','resources','assessments','focusLog'])if(!Array.isArray(raw[key]))throw new Error(`The workspace ${key} collection is missing or damaged.`);
 if(raw.version===3&&!Array.isArray(raw.taskHistory))throw new Error('The task history collection is missing or damaged.');
 for(const key of ['subjects','tasks','mistakes','folders','resources','assessments','taskHistory']){
  const records=(raw[key]||[]) as unknown[];const ids=new Set<string>();
  for(const item of records){if(!item||typeof item!=='object'||typeof (item as {id?:unknown}).id!=='string'||!(item as {id:string}).id||ids.has((item as {id:string}).id))throw new Error(`The workspace ${key} contains an invalid or duplicate record.`);ids.add((item as {id:string}).id);}
 }
 for(const task of [...raw.tasks as Task[],...(raw.taskHistory||[]) as Task[]])if(typeof task.title!=='string'||typeof task.subject!=='string'||typeof task.notes!=='string'||typeof task.due!=='string'||!Number.isFinite(task.duration)||!Number.isFinite(task.priority)||!Array.isArray(task.labels)||task.labels.some(label=>typeof label!=='string')||!Array.isArray(task.subtasks)||task.subtasks.some(item=>!item||typeof item.id!=='string'||typeof item.title!=='string'||typeof item.done!=='boolean')||!['To study','In progress','Practicing','Completed'].includes(task.stage)||typeof task.done!=='boolean')throw new Error('A saved task is damaged. Restore a valid workspace export.');
 for(const mistake of raw.mistakes as Mistake[])if(mistake.mastery!==undefined&&(!Number.isInteger(mistake.mastery)||mistake.mastery<1||mistake.mastery>5))throw new Error('A saved mistake has an invalid mastery rating.');
 return migrateStoredState(value as State);
}
export function rollUpMastery(folders:Folder[],resources:Resource[]):Folder[]{
 const collect=(id:string):string[]=>[id,...folders.filter(f=>f.parent===id).flatMap(f=>collect(f.id))];
 return folders.map(f=>{const ids=collect(f.id);const items=resources.filter(r=>ids.includes(r.folder));return {...f,mastery:items.length?Math.round(items.reduce((sum,r)=>sum+r.mastery,0)/items.length):0};});
}
