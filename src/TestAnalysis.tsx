import { SmoothSelect } from './components/ui/SmoothSelect';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Download, FileText, Info, Leaf, Printer, RotateCcw, Share2, Trophy, Upload } from 'lucide-react';
import type { CohortRecord, QuestionAnalysis, TestAttempt } from './testing-model';
import { analyseAttempt, compareCohort, getAttemptQuestions, parseCohortJSON, scoreQuestion, paperFingerprint } from './testing-model';
import { categories, day, uid } from './model';
import { useStore } from './store';
import { CountUp, Empty, Markdown, Modal, duration, gsap, useGSAP } from './ui';
import { StudyIllustration } from './StudyIllustration';
import './test-analysis.css';
import { TimeAnalysis } from './TimeAnalysis';
import { TestBreakdown, SubjectTimeCharts, TimeQualityChart, TimeJourneyCharts, DifficultyCharts, ErrorOptimizationChart, AttemptEfficiencyCharts } from './ResultCharts';
import { ResultShareCard } from './ResultShareCard';
import { ResultQuestionReview } from './ResultQuestionReview';
import type { QuestionReviewFilter } from './ResultQuestionReview';
import { formatResultTime as fmt } from './result-metrics';
import './report-workspace.css';

type Props={attempt:TestAttempt;cohort:CohortRecord[];onCohortChange:(rows:CohortRecord[])=>void;onBack:()=>void;onRetake:()=>void;integritySummary?:React.ReactNode};
type Peer=CohortRecord&{questionResults?:{questionId:string;status:string;timeSeconds:number;answeredAtSeconds?:number}[];paperId?:string};
const sections = [['overview', 'Overview'], ['performance', 'Test breakdown'], ['time', 'Time analysis'], ['attempts', 'Attempts'], ['difficulty', 'Difficulty'], ['movement', 'Subject movement'], ['errors', 'Errors'], ['journey', 'Question journey'], ['questions', 'Question by question'], ['share', 'Share card']] as const;
const comparativeSections = [['cohort', 'Import results'], ['comparison', 'Performance'], ['detail', 'Difficulty'], ['comparison-time', 'Time analysis']] as const;
type ResultSection = typeof sections[number][0];
type ComparativeSection = typeof comparativeSections[number][0];
const decimal=(value:number|null)=>value===null?'—':Number(value.toFixed(2)).toLocaleString();
function saveFile(name:string,data:BlobPart,type='application/json'){const url=URL.createObjectURL(new Blob([data],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvRows(source:string){const rows:string[][]=[];let row:string[]=[],field='',quoted=false;for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){if(quoted&&source[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}else field+=c;}if(quoted)throw new Error('A CSV value has an unclosed quote.');row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;}
function parsePeers(source:string,name:string):CohortRecord[]{if(name.toLowerCase().endsWith('.csv')){const rows=csvRows(source);const header=rows.shift()?.map(x=>x.trim())||[];const required=['name','score','timeSeconds','attempted','correct'];if(new Set(header).size!==header.length)throw new Error('CSV column names must be unique.');for(const field of required)if(!header.includes(field))throw new Error('CSV needs a '+field+' column.');return parseCohortJSON(JSON.stringify(rows.map((row,index)=>{if(row.length!==header.length)throw new Error('CSV row '+(index+2)+' has a different number of values than its header.');const record:Record<string,unknown>={};for(const key of required){const cell=row[header.indexOf(key)]?.trim();if(!cell)throw new Error('CSV row '+(index+2)+' is missing '+key+'.');record[key]=key==='name'?cell:Number(cell);}for(const key of ['paperId','paperFingerprint'])if(header.includes(key)&&row[header.indexOf(key)].trim())record[key]=row[header.indexOf(key)].trim();return record;})));}const value=JSON.parse(source);const records=Array.isArray(value)?value.map(row=>row.cohortRecord||row):value.cohortRecord?[value.cohortRecord]:value;return parseCohortJSON(JSON.stringify(records));}

function Table({headers,rows,caption}:{headers:string[];rows:React.ReactNode[][];caption:string}){return <div className="analysis-table-wrap"><table className="analysis-table"><caption className="sr-only">{caption}</caption><thead><tr>{headers.map((h,i)=><th key={i} scope="col">{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=>j===0?<th key={j} scope="row">{cell}</th>:<td key={j}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className="analysis-muted p-4">No matching records.</p>}</div>;}
function Panel({title,description,children}:{title:string;description?:string;children:React.ReactNode}){return <section className="analysis-panel"><div className="analysis-section-heading"><h2>{title}</h2>{description&&<p>{description}</p>}</div>{children}</section>;}
function ReportPane({id, active, children}: {id: ResultSection | ComparativeSection; active: boolean; children: React.ReactNode}) {
  return <div id={`analysis-${id}`} className={`analysis-report-pane${id === 'share' ? ' analysis-share-pane' : ''}`} hidden={!active}>{children}</div>;
}

function AnalysisSectionNav<T extends string>({options, current, onSelect, label, counts}: {
  options: readonly (readonly [T, string])[];
  current: T;
  onSelect: (id: T) => void;
  label: string;
  counts?: Partial<Record<T, number>>;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const [scroll, setScroll] = useState({overflow: false, back: false, forward: false});

  useEffect(() => {
    const container = wrapper.current;
    const nav = rail.current;
    if (!container || !nav) return;

    const measure = () => {
      const overflow = getComputedStyle(nav).flexDirection === 'row' && nav.scrollWidth > container.clientWidth + 1;
      const back = overflow && nav.scrollLeft > 1;
      const forward = overflow && nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
      setScroll(previous => previous.overflow === overflow && previous.back === back && previous.forward === forward
        ? previous
        : {overflow, back, forward});
    };

    const scrollWithWheel = (event: WheelEvent) => {
      if (getComputedStyle(nav).flexDirection !== 'row' || event.ctrlKey || event.shiftKey ||
          Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? nav.clientWidth : 1;
      const next = Math.max(0, Math.min(nav.scrollWidth - nav.clientWidth, nav.scrollLeft + event.deltaY * scale));
      if (Math.abs(nav.scrollLeft - next) < 1) return;
      event.preventDefault();
      nav.scrollLeft = next;
    };

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(nav);
    nav.addEventListener('scroll', measure);
    nav.addEventListener('wheel', scrollWithWheel, {passive: false});
    measure();
    return () => {
      observer.disconnect();
      nav.removeEventListener('scroll', measure);
      nav.removeEventListener('wheel', scrollWithWheel);
    };
  }, [options.length]);

  useLayoutEffect(() => {
    const nav = rail.current;
    const active = nav?.querySelector<HTMLButtonElement>('[aria-current]');
    if (!nav || !active) return;
    const bounds = nav.getBoundingClientRect();
    const button = active.getBoundingClientRect();
    const inset = 4;
    const left = bounds.left + inset;
    const right = bounds.left + nav.clientWidth - inset;
    const top = bounds.top + inset;
    const bottom = bounds.top + nav.clientHeight - inset;
    nav.scrollBy({
      left: button.left < left ? Math.floor(button.left - left) : Math.max(0, Math.ceil(button.right - right)),
      top: button.top < top ? Math.floor(button.top - top) : Math.max(0, Math.ceil(button.bottom - bottom)),
      behavior: 'instant',
    });
  }, [current, scroll.overflow]);

  function moveRail(direction: -1 | 1) {
    const nav = rail.current;
    if (!nav) return;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    nav.scrollBy({left: direction * nav.clientWidth * .8, behavior: reduceMotion ? 'instant' : 'smooth'});
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const horizontal = getComputedStyle(event.currentTarget).flexDirection === 'row';
    const previous = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const next = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (![previous, next, 'Home', 'End'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const index = buttons.findIndex(button => button === event.target);
    if (index < 0) return;
    event.preventDefault();
    const target = event.key === 'Home' ? buttons[0]
      : event.key === 'End' ? buttons.at(-1)
      : buttons[(index + (event.key === previous ? -1 : 1) + buttons.length) % buttons.length];
    target?.focus({preventScroll: true});
    target?.click();
  }

  return <div ref={wrapper} className="analysis-section-navigation" data-scrollable={scroll.overflow || undefined}>
    {scroll.overflow && <button type="button" className="analysis-section-scroll" aria-label="Scroll to earlier sections" disabled={!scroll.back} onClick={() => moveRail(-1)}><ChevronLeft size={17}/></button>}
    <nav ref={rail} className="analysis-section-nav" aria-label={label} onKeyDown={onKeyDown}>
      {options.map(([id, name]) => <button type="button" key={id} aria-controls={`analysis-${id}`} className={current === id ? 'active' : ''} aria-current={current === id ? 'page' : undefined} onClick={() => onSelect(id)}>
        {name}{Boolean(counts?.[id]) && <span>{counts?.[id]}</span>}
      </button>)}
    </nav>
    {scroll.overflow && <button type="button" className="analysis-section-scroll" aria-label="Scroll to later sections" disabled={!scroll.forward} onClick={() => moveRail(1)}><ChevronRight size={17}/></button>}
  </div>;
}

function MiniBars({rows,suffix='',max}:{rows:{name:string;value:number}[];suffix?:string;max?:number}){const highest=max||Math.max(1,...rows.map(r=>r.value));return <div className="analysis-mini-bars">{rows.map(row=><div key={row.name}><div><span>{row.name}</span><b>{decimal(row.value)}{suffix}</b></div><div className="analysis-bar-track"><span style={{width:`${Math.max(0,Math.min(100,row.value/highest*100))}%`}}/></div></div>)}</div>;}
function answerText(row:QuestionAnalysis,correct=false){const q=row.question;if(q.kind==='numeric')return correct?String(q.numericAnswer??''):typeof row.response.value==='string'&&row.response.value.trim()?row.response.value:'No answer';const values=correct?q.correctAnswers:Array.isArray(row.response.value)?row.response.value:[];return values.length?values.map(i=>`${String.fromCharCode(65+i)}. ${q.options[i]}`).join('\n\n'):'No answer';}

export function TestAnalysis({attempt,cohort,onCohortChange,onBack,onRetake,integritySummary}:Props){
 const {data,update,notify}=useStore();
 const [tab,setTab]=useState<'personal'|'comparative'>('personal');
 const [section,setSection]=useState<ResultSection>('overview');
 const [comparativeSection,setComparativeSection]=useState<ComparativeSection>('cohort');
 const [questionFilter,setQuestionFilter]=useState<QuestionReviewFilter>({subject:'',outcome:'all',search:''});
 const [selected,setSelected]=useState<QuestionAnalysis|null>(null);
 const [leaderboard,setLeaderboard]=useState(false);
 const [exporting,setExporting]=useState(false);
 const [importError,setImportError]=useState('');
 const [cohortName,setCohortName]=useState('');const [shareOpen,setShareOpen]=useState(false);const [pasteOpen,setPasteOpen]=useState(false);const [pasteText,setPasteText]=useState('');
 const [scenario,setScenario]=useState(0);
 const [tags,setTags]=useState<Record<string,string>>(()=>{try{return JSON.parse(localStorage.getItem(`verdant.test-errors.${attempt.id}`)||'{}');}catch{return {};}});
 const fileInput=useRef<HTMLInputElement>(null),root=useRef<HTMLDivElement>(null);
 const annotated=useMemo(()=>({...attempt,responses:Object.fromEntries(Object.entries(attempt.responses).map(([id,r])=>[id,{...r,errorCategory:tags[id]||r.errorCategory}]))}),[attempt,tags]);
 const analysis=useMemo(()=>analyseAttempt(annotated),[annotated]);
 const comparison=useMemo(()=>compareCohort(analysis,cohort),[analysis,cohort]);
 const displayedQuestions = useMemo(() => getAttemptQuestions(attempt), [attempt]);
 const questionNumbers = useMemo(() => new Map(displayedQuestions.map((question, index) => [question.id, index + 1])), [displayedQuestions]);
 const displayRows = useMemo(() => {
   const rowsById = new Map(analysis.questionRows.map(row => [row.question.id, row]));
   return displayedQuestions.map(question => rowsById.get(question.id)!);
 }, [analysis.questionRows, displayedQuestions]);
 const wrong=displayRows.filter(r=>r.status==='incorrect');
 const comparisonPane = cohort.length ? comparativeSection : 'cohort';
 const scenarioScore=analysis.score+wrong.slice(0,scenario).reduce((sum,r)=>sum+r.question.marks+r.negativeScore,0);
 useGSAP(()=>{
   const pane = root.current?.querySelector('.analysis-report-pane:not([hidden])');
   const layout = pane?.closest('.analysis-reading-layout');
   if (layout && layout.getBoundingClientRect().top < 0) layout.scrollIntoView({block:'start',behavior:'instant'});
   if (pane) gsap.fromTo(pane,{opacity:0,y:8},{opacity:1,y:0,duration:duration(.24),ease:'expo.out',clearProps:'opacity,transform'});
 },{scope:root,dependencies:[tab,section,comparisonPane],revertOnUpdate:true});

 function analysisTabKey(event:React.KeyboardEvent<HTMLDivElement>){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'personal':event.key==='End'?'comparative':tab==='personal'?'comparative':'personal';setTab(next);event.currentTarget.querySelector<HTMLButtonElement>(next==='personal'?'#analysis-personal-tab':'#analysis-comparative-tab')?.focus();}
 function showSection(id: ResultSection) {
   setTab('personal');
   setSection(id);
 }
 function applyCohort(source:string,name:string){setImportError('');try{if(source.length>10*1024*1024)throw new Error('Keep cohort data smaller than 10 MB.');const peers=parsePeers(source,name);if(peers.some(peer=>peer.paperFingerprint&&peer.paperFingerprint!==paperFingerprint(attempt.paper)))throw new Error('These results use a different question paper revision or answer key.');if(peers.some(p=>(p as Peer).paperId&&(p as Peer).paperId!==attempt.paper.id))throw new Error('This file contains results for another test. Import results for this paper only.');if(peers.some(p=>p.score < -attempt.paper.questions.reduce((sum,q)=>sum+q.negativeMarks,0)))throw new Error('A cohort score is below the maximum possible negative score.');if(peers.some(p=>p.score>analysis.maxScore||p.attempted>attempt.paper.questions.length||p.timeSeconds>attempt.paper.durationMinutes*60+1))throw new Error('A cohort record exceeds this paper’s marks, question count, or duration.');for(const peer of peers){if(peer.subjectScores){for(const [name,value] of Object.entries(peer.subjectScores)){const group=analysis.subjects.find(g=>g.name===name);if(!group)throw new Error('An imported subject score does not match this paper.');const minimum=-attempt.paper.questions.filter(q=>q.subject===name).reduce((sum,q)=>sum+q.negativeMarks,0);if(value<minimum||value>group.maxScore)throw new Error('An imported subject score is outside the possible marks for '+name+'.');}if(Object.keys(peer.subjectScores).length===analysis.subjects.length&&Math.abs(Object.values(peer.subjectScores).reduce((sum,n)=>sum+n,0)-peer.score)>.01)throw new Error('The imported subject scores do not add up to the total score.');}if(peer.questionResults){if(peer.questionResults.some(r=>!attempt.paper.questions.some(q=>q.id===r.questionId)||r.timeSeconds>attempt.paper.durationMinutes*60||(r.answeredAtSeconds??0)>attempt.paper.durationMinutes*60))throw new Error('A detailed result references another paper or an impossible time.');if(peer.questionResults.length===attempt.paper.questions.length){const attempted=peer.questionResults.filter(r=>r.status==='correct'||r.status==='incorrect').length;const correct=peer.questionResults.filter(r=>r.status==='correct').length;const score=peer.questionResults.reduce((sum,r)=>{const q=attempt.paper.questions.find(q=>q.id===r.questionId)!;return sum+(r.status==='correct'?q.marks:r.status==='incorrect'?-q.negativeMarks:0);},0);const seconds=peer.questionResults.reduce((sum,r)=>sum+r.timeSeconds,0);if(attempted!==peer.attempted||correct!==peer.correct||Math.abs(score-peer.score)>.01||Math.abs(seconds-peer.timeSeconds)>1)throw new Error('A detailed result does not agree with its score, answer counts, or total time.');}}}onCohortChange(peers);setCohortName(name);setPasteOpen(false);notify(`${peers.length} actual results imported`);}catch(e){setImportError(e instanceof Error?e.message:'Unable to read this cohort file.');}}
 async function importCohort(file:File){if(file.size>10*1024*1024){setImportError('Choose a cohort file smaller than 10 MB.');return;}try{applyCohort(await file.text(),file.name);}catch{setImportError('This file could not be read.');}}
 function eventLabel(event:TestAttempt['events'][number],index:number){if(event.type==='answer'){const row=analysis.questionRows.find(r=>r.question.id===event.questionId);if(!row)return 'Answer saved';const correct=scoreQuestion(row.question,{...row.response,value:event.value??[]}).correct;const previous=attempt.events.slice(0,index).reverse().find(e=>e.questionId===event.questionId&&e.type==='answer');const wasCorrect=previous?scoreQuestion(row.question,{...row.response,value:previous.value??[]}).correct:false;return correct?'Answered correctly':wasCorrect?'Changed correct answer to incorrect':'Answered incorrectly';}return event.type==='visit'?'Opened question':event.type==='clear'?'Answer cleared':event.type==='review'?(event.markedReview?'Marked for review':'Review flag removed'):event.type==='start'?'Test started':'Test submitted';}
 function resultRecord():Peer{
  const lastAnswer=new Map(attempt.events.filter(event=>event.type==='answer'&&event.questionId).map(event=>[event.questionId!,event.at]));
  return {name:localStorage.getItem('verdant.name')||'My result',paperId:attempt.paper.id,paperFingerprint:paperFingerprint(attempt.paper),score:analysis.score,timeSeconds:analysis.timeSeconds,attempted:analysis.attempted,correct:analysis.correct,subjectScores:Object.fromEntries(analysis.subjects.map(s=>[s.name,s.score])),questionResults:analysis.questionRows.map(row=>{const at=lastAnswer.get(row.question.id),valid=row.attempted&&at!==undefined&&Number.isFinite(at)&&at>=attempt.startedAt&&at<=attempt.deadlineAt;return {questionId:row.question.id,status:row.status,timeSeconds:row.timeSeconds,...(valid?{answeredAtSeconds:(at!-attempt.startedAt)/1000}:{})};})};
 }
 async function exportReport(){
   setExporting(true);
   try {
     const {createResultPdf} = await import('./result-pdf');
     const report = await createResultPdf(attempt, analysis);
     const title = attempt.paper.title.replace(/[^\p{Letter}\p{Mark}\p{Number}]+/gu, '-').slice(0, 100).replace(/^-+|-+$/g, '') || 'verdant';
     saveFile(`${title}-analysis.pdf`, report, report.type);
   } catch {
     notify('This analysis could not be downloaded. Try again or use the print option.');
   } finally {
     setExporting(false);
   }
 }
 async function copyResult(){try{await navigator.clipboard.writeText(JSON.stringify([resultRecord()],null,2));notify('Actual result copied as comparison JSON');}catch{notify('Select the JSON text to copy it manually, or download it.');}}
 function tagQuestion(id:string,value:string){const next={...tags,[id]:value};setTags(next);try{localStorage.setItem(`verdant.test-errors.${attempt.id}`,JSON.stringify(next));}catch{notify('This browser could not save the error label.');}}
 function captureMistake(row:QuestionAnalysis){if(!tags[row.question.id]){notify('Choose your error category before adding this question to the Mistake Book.');return;}const subjectName=row.question.subject;const existing=data.subjects.find(s=>s.name.toLowerCase()===subjectName.toLowerCase());const sid=existing?.id||uid();update(s=>({...s,subjects:existing?s.subjects:[...s.subjects,{id:sid,name:subjectName,color:'green'}],folders:existing?s.folders:[...s.folders,{id:uid(),name:subjectName,subject:sid,parent:null,pinned:false,mastery:0}],mistakes:[{id:uid(),title:`${attempt.paper.title} · question ${questionNumbers.get(row.question.id)}`,subject:sid,topic:[row.question.chapter,row.question.topic].filter(Boolean).join(' → '),category:tags[row.question.id],prompt:row.question.prompt,wrong:answerText(row),solution:`**Correct answer:**\n\n${answerText(row,true)}\n\n${row.question.explanation}`,takeaway:'',difficulty:row.question.difficulty==='Easy'?1:row.question.difficulty==='Moderate'?3:5,status:'Needs review',review:day(),attempts:0},...s.mistakes]}));notify('Question captured in your Mistake Book');}

 const cohortPeers=cohort as Peer[];
 const sorted=[...cohortPeers].sort((a,b)=>b.score-a.score||a.timeSeconds-b.timeSeconds);
 const peerSets=[{name:'Yours',records:[] as Peer[],self:true},{name:'Top scorer',records:sorted.slice(0,1),self:false},{name:'Top 10% of imported cohort',records:sorted.slice(0,Math.max(1,Math.ceil(sorted.length*.1))),self:false},{name:'Top 25% of imported cohort',records:sorted.slice(0,Math.max(1,Math.ceil(sorted.length*.25))),self:false}];
 const avg=(peers:Peer[],get:(p:Peer)=>number)=>peers.length?peers.reduce((sum,p)=>sum+get(p),0)/peers.length:0;
 const completePeers=cohortPeers.filter(p=>p.questionResults?.length===attempt.paper.questions.length&&p.questionResults.every(r=>attempt.paper.questions.some(q=>q.id===r.questionId)));
 const submitted = new Date(attempt.submittedAt || attempt.deadlineAt);
 const answerSummary = analysis.attempted
   ? `${analysis.correct} of ${analysis.attempted} ${analysis.attempted === 1 ? 'answer was' : 'answers were'} correct.`
   : 'No answers were recorded.';
 const reviewSummary = wrong.length
   ? `${wrong.length} ${wrong.length === 1 ? 'question was' : 'questions were'} answered incorrectly.${analysis.negativeScore ? ` Negative marking deducted ${decimal(analysis.negativeScore)} ${analysis.negativeScore === 1 ? 'mark' : 'marks'}.` : ''} Open the question review to see the answer key and your response.`
   : analysis.unattempted
     ? `${analysis.unattempted} ${analysis.unattempted === 1 ? 'question was' : 'questions were'} left unanswered. Open the question review to revisit the paper.`
     : 'Open the time analysis to see how you paced yourself across the paper.';

 function reviewAttempt() {
   const id = wrong.length || analysis.unattempted ? 'questions' : 'time';
   setQuestionFilter({subject:'',search:'',outcome:wrong.length ? 'incorrect' : 'all'});
   showSection(id);
   root.current?.querySelector<HTMLButtonElement>(`[aria-controls="analysis-${id}"]`)?.focus({preventScroll:true});
 }

 return <div className="test-analysis" ref={root}>
   <div className="analysis-topline"><button className="text-link" onClick={onBack}><ArrowLeft size={15}/>All tests</button></div>
   <header className="analysis-report-lead">
     <div>
       <p className="analysis-report-meta"><strong>{attempt.paper.title}</strong><span>Submitted {submitted.toLocaleString('en-IN')}</span></p>
       <h1>You scored {decimal(analysis.score)} out of {decimal(analysis.maxScore)}.</h1>
     </div>
     <div className="analysis-actions analysis-lead-actions">
       <button className="button secondary" onClick={onRetake}><RotateCcw size={15}/>Retake test</button>
       <button className="button secondary" onClick={() => showSection('share')}><Share2 size={15}/>Share card</button>
       <button className="button analysis-solutions-action" onClick={() => { showSection('questions'); setSelected(wrong[0] || displayRows[0]); }}><BookOpen size={15}/>View solutions</button>
     </div>
   </header>
   <div className="analysis-view-controls">
     <div className="analysis-tabs" role="tablist" aria-label="Analysis type" onKeyDown={analysisTabKey}><button role="tab" id="analysis-personal-tab" aria-controls="analysis-personal-panel" tabIndex={tab==='personal'?0:-1} aria-selected={tab==='personal'} className={tab==='personal'?'active':''} onClick={()=>setTab('personal')}>Result analysis</button><button role="tab" id="analysis-comparative-tab" aria-controls="analysis-comparative-panel" tabIndex={tab==='comparative'?0:-1} aria-selected={tab==='comparative'} className={tab==='comparative'?'active':''} onClick={()=>setTab('comparative')}>Comparative analysis</button></div>
     <div className="analysis-actions analysis-report-tools">
       <button className="button secondary" onClick={exportReport} disabled={exporting} aria-busy={exporting} title="Download result analysis as a PDF"><Download size={15}/>{exporting ? 'Preparing PDF…' : 'Download analysis'}</button>
       <button className="button secondary" onClick={() => window.print()}><Printer size={15}/>Print / save PDF</button>
       <button className="button secondary" onClick={() => setLeaderboard(true)}><Trophy size={15}/>Leaderboard</button>
     </div>
   </div>
   <div role="tabpanel" id={`analysis-${tab}-panel`} aria-labelledby={`analysis-${tab}-tab`}>
   {tab==='personal'?<div className="analysis-reading-layout">
     <AnalysisSectionNav options={sections} current={section} onSelect={showSection} label="Analysis sections" counts={{errors: wrong.length, questions: attempt.paper.questions.length}}/>
     <div className="analysis-reading-content">
     <ReportPane id="overview" active={section === 'overview'}>
       <section aria-labelledby="analysis-overview-title">
       <div className="analysis-overview-banner">
         <div><span className="analysis-banner-label">Attempt overview</span><h2 id="analysis-overview-title">Your test is complete.</h2><p>See how you scored, where you spent your time, and which questions to revisit.</p></div>
         <StudyIllustration variant="notebook" className="analysis-notebook" size={252} />
       </div>
       <div className="analysis-insight">
         <span className="analysis-insight-label"><span><Leaf size={17}/></span>From your attempt</span>
         <h3>{answerSummary}</h3>
         <p>{reviewSummary}</p>
         <button className="analysis-insight-action" onClick={reviewAttempt}>{wrong.length ? 'Review incorrect answers' : analysis.unattempted ? 'Open question review' : 'See time analysis'}<ArrowRight size={16}/></button>
       </div>
       <div className="analysis-kpis">{[{label:'Score',value:analysis.score,suffix:` / ${analysis.maxScore}`},{label:'Questions attempted',value:analysis.attempted,suffix:` / ${attempt.paper.questions.length}`},{label:'Accuracy',value:analysis.accuracy,suffix:'%'},{label:'Time taken',value:analysis.timeSeconds<60?Math.round(analysis.timeSeconds):Number((analysis.timeSeconds/60).toFixed(1)),suffix:analysis.timeSeconds<60?' sec':' min'},{label:'Positive score',value:analysis.positiveScore,suffix:' marks'},{label:'Negative marks',value:analysis.negativeScore,suffix:' marks'}].map(kpi=><div className="analysis-kpi" key={kpi.label}><span>{kpi.label}</span><b><CountUp value={kpi.value}/><small>{kpi.suffix}</small></b></div>)}</div>
       {integritySummary}
       </section>
     </ReportPane>
     <ReportPane id="performance" active={section === 'performance'}>
       <Panel title="Test breakdown" description="Subject-wise breakdown of your correct, incorrect, unattempted and not visited questions."><TestBreakdown analysis={analysis}/></Panel>
     </ReportPane>
     <ReportPane id="time" active={section === 'time'}>
       <Panel title="Time analysis" description="Your recorded time, attempted questions, and accuracy by subject."><TimeAnalysis attempt={attempt} analysis={analysis} cohort={cohort} onImport={()=>{setComparativeSection('cohort');setTab('comparative');}}/><SubjectTimeCharts analysis={analysis}/><TimeQualityChart analysis={analysis}/><details className="rc-outcome-journey"><summary>Compare correct and incorrect answer trends together</summary><TimeJourneyCharts attempt={attempt} analysis={analysis}/></details></Panel>
     </ReportPane>
     <ReportPane id="attempts" active={section === 'attempts'}>
       <Panel title="Attempt analysis" description="Perfect: correct within the target time. Wasted: incorrect within half the target. Overtime: answered after the target. Confused: unanswered beyond the target. Other attempts are listed separately."><Table caption="Attempt efficiency" headers={['Evaluation','Questions','Time spent']} rows={['Perfect','Wasted','Overtime','Confused','Other','Unattempted'].map(label=>{const matching=analysis.questionRows.filter(r=>r.timeCategory===label);return [label,matching.length,fmt(matching.reduce((sum,r)=>sum+r.timeSeconds,0))];})}/><AttemptEfficiencyCharts analysis={analysis}/></Panel>
     </ReportPane>
     <ReportPane id="difficulty" active={section === 'difficulty'}>
       <Panel title="Difficulty analysis" description="Difficulty and target time come from the question author."><DifficultyCharts analysis={analysis}/></Panel>
     </ReportPane>
     <ReportPane id="movement" active={section === 'movement'}>
       <Panel title="Subject movement" description="The actual sequence of subject changes recorded while you worked through the test."><div className="analysis-movement">{analysis.subjectMovement.map((move,i)=><button key={i} onClick={()=>setSelected(analysis.questionRows.find(r=>r.question.id===move.questionId)||null)}><span>{i+1}</span><div><b>{move.subject}</b><small>{fmt((move.at-attempt.startedAt)/1000)} into test</small></div><ChevronRight size={14}/></button>)}</div></Panel>
     </ReportPane>
     <ReportPane id="errors" active={section === 'errors'}>
       <Panel title="Error analysis" description="Review wrong and unanswered questions by chapter. Add your own error labels after checking the solution."><Table caption="Chapter errors" headers={['Chapter','Incorrect','Unanswered','Marks missed']} rows={analysis.chapters.filter(g=>g.incorrect||g.unattempted).map(g=>[g.name,g.incorrect,g.unattempted,decimal(g.maxScore-g.score)])}/><div className="analysis-error-tags">{Object.entries(tags).filter(([,label])=>label).map(([id,label])=><button key={id} onClick={()=>setSelected(analysis.questionRows.find(r=>r.question.id===id)||null)}>Q{questionNumbers.get(id)} · {label}</button>)}</div><ErrorOptimizationChart analysis={analysis}/><details className="analysis-correction-details"><summary>Explore correcting individual answers</summary><div className="analysis-scenario"><div><h3>Score improvement scenario</h3><p>A calculation from the answer key, not a prediction of your next score. Correcting the first {scenario} incorrect questions would change your score to:</p></div><b>{decimal(scenarioScore)}<small> / {analysis.maxScore}</small></b><label>Incorrect answers corrected<input type="range" min={0} max={wrong.length} value={scenario} disabled={!wrong.length} onChange={e=>setScenario(Number(e.target.value))}/></label><div className="analysis-scenario-values"><span>Actual: {decimal(analysis.score)}</span><span>Without negative marks: {decimal(analysis.improvement.scoreWithoutNegative)}</span><span>All incorrect answers corrected: {decimal(analysis.improvement.scoreIfIncorrectCorrect)}</span></div></div></details></Panel>
     </ReportPane>
     <ReportPane id="journey" active={section === 'journey'}>
       <Panel title="Question journey" description="Each visit, answer change, clear, and review flag is recorded chronologically."><div className="analysis-event-list">{analysis.journey.map((event,i)=><button key={i} onClick={()=>setSelected(analysis.questionRows.find(r=>r.question.id===event.questionId)||null)}><time>{fmt((event.at-attempt.startedAt)/1000)}</time><span className="analysis-event-question">{event.questionId?'Q'+(questionNumbers.get(event.questionId)):'—'}</span><span>{eventLabel(event,i)}</span><ChevronRight size={13}/></button>)}</div></Panel>
     </ReportPane>
     <ReportPane id="questions" active={section === 'questions'}>
       <ResultQuestionReview
         rows={displayRows}
         questionNumbers={questionNumbers}
         subjects={analysis.subjects}
         filter={questionFilter}
         onFilter={setQuestionFilter}
         onReview={setSelected}
       />
     </ReportPane>
     <ReportPane id="share" active={section === 'share'}>
       <ResultShareCard attempt={attempt} analysis={analysis} notify={notify}/>
     </ReportPane>
     </div></div>:<div className="analysis-reading-layout">
     <AnalysisSectionNav options={cohort.length ? comparativeSections : comparativeSections.slice(0, 1)} current={comparisonPane} onSelect={setComparativeSection} label="Comparative analysis sections"/>
     <div className="analysis-reading-content">
     <ReportPane id="cohort" active={comparisonPane === 'cohort'}>
      {integritySummary}
     <Panel title="Compare with real results" description="Import peer results for this exact paper. The app has no access to Quizrr accounts, ranks, or its private question bank."><div className="analysis-cohort-actions"><button className="button primary" onClick={()=>fileInput.current?.click()}><Upload size={15}/>Import cohort JSON / CSV</button><input className="sr-only" type="file" ref={fileInput} accept=".json,.csv,application/json,text/csv" aria-label="Import real cohort results" onChange={e=>{const file=e.target.files?.[0];if(file)void importCohort(file);e.target.value='';}}/><button className="button secondary" onClick={()=>{setImportError('');setPasteOpen(true);}}>Paste results JSON</button><button className="button secondary" onClick={()=>setShareOpen(true)}>Export comparison JSON</button><button className="button secondary" onClick={()=>saveFile('cohort-template.csv','name,score,timeSeconds,attempted,correct\n','text/csv')}><FileText size={14}/>Empty CSV template</button>{cohort.length>0&&<button className="button secondary" onClick={()=>{onCohortChange([]);setComparativeSection('cohort');notify('Imported comparison cleared');}}>Clear comparison</button>}</div><p className="analysis-muted mt-3">JSON accepts an array of result records or exported Verdant analysis files’ cohortRecord objects. Include detailed questionResults to unlock difficulty and hourly comparisons.</p>{cohortName&&<p className="analysis-muted mt-2">Source: {cohortName}</p>}{importError&&<p className="form-error" role="alert">{importError}</p>}</Panel>
     {!cohort.length && <Empty illustration="analytics" title="Your result needs a real comparison group" description="Import actual results from people who took this paper. Rank and percentile will appear only when peer records are available."/>}
     </ReportPane>
     {cohort.length > 0 && <>
     <ReportPane id="comparison" active={comparisonPane === 'comparison'}>
     <div className="analysis-kpis comparison-kpis">{[{label:'Rank in imported cohort + you',value:comparison.rank,suffix:` / ${cohort.length+1}`},{label:'Empirical percentile',value:comparison.percentile,suffix:'%'},{label:'Cohort average',value:comparison.averageScore,suffix:' marks'},{label:'Top cohort score',value:comparison.topScore,suffix:' marks'}].map(k=><div className="analysis-kpi" key={k.label}><span>{k.label}</span><b>{decimal(k.value)}<small>{k.suffix}</small></b></div>)}</div><p className="analysis-method"><Info size={15}/>{comparison.method} This is not an official or predicted exam percentile.</p>
     <Panel title="Performance, time & accuracy"><Table caption="Peer comparison" headers={['Group','Score','Time','Attempt rate','Accuracy']} rows={peerSets.map(group=>{if(group.self)return [group.name,decimal(analysis.score),fmt(analysis.timeSeconds),`${decimal(analysis.attempted/attempt.paper.questions.length*100)}%`,`${decimal(analysis.accuracy)}%`];return [group.name,decimal(avg(group.records,p=>p.score)),fmt(avg(group.records,p=>p.timeSeconds)),`${decimal(avg(group.records,p=>p.attempted)/attempt.paper.questions.length*100)}%`,`${decimal(avg(group.records,p=>p.attempted?p.correct/p.attempted*100:0))}%`];})}/><div className="analysis-chart-grid"><div><h3>Score distribution</h3><MiniBars rows={comparison.scoreDistribution.map(bucket=>({name:bucket.label,value:bucket.count}))} suffix=" people"/></div><div><h3>Subject score comparison</h3>{analysis.subjects.map(g=>{const peers=cohortPeers.filter(p=>Number.isFinite(p.subjectScores?.[g.name]));return <div className="analysis-peer-subject" key={g.name}><b>{g.name}</b><span>You: {decimal(g.score)} / {g.maxScore}</span><span>{peers.length?`Peer average: ${decimal(avg(peers,p=>p.subjectScores![g.name]))} (${peers.length} results)`:'Subject scores not supplied in imported results'}</span></div>;})}</div></div></Panel>
     </ReportPane>
     <ReportPane id="detail" active={comparisonPane === 'detail'}>
       <Panel title="Detailed comparative analysis" description="Detailed charts use only cohort records with a complete questionResults set matching this paper.">{completePeers.length?<><p className="analysis-muted mb-4">{completePeers.length} of {cohort.length} imported results include full question detail.</p><Table caption="Cohort difficulty comparison" headers={['Difficulty','Your correct / incorrect / unanswered','Peer average correct / incorrect / unanswered']} rows={analysis.difficulties.map(g=>{const ids=new Set(analysis.questionRows.filter(r=>r.question.difficulty===g.name).map(r=>r.question.id));return [g.name,`${g.correct} / ${g.incorrect} / ${g.unattempted}`,['correct','incorrect','unanswered'].map(state=>decimal(avg(completePeers,p=>p.questionResults!.filter(r=>ids.has(r.questionId)&&(state==='unanswered'?['unattempted','unvisited'].includes(r.status):r.status===state)).length))).join(' / ')];})}/></>:<p className="analysis-muted">The imported rows contain summary scores. To compare difficulty or hourly performance, import detailed results exported by Verdant. No detail is inferred from a total score.</p>}</Panel>
     </ReportPane>
     <ReportPane id="comparison-time" active={comparisonPane === 'comparison-time'}>
       <Panel title="Time analysis" description="Compare recorded time and final answer intervals using the actual imported cohort."><TimeAnalysis attempt={attempt} analysis={analysis} cohort={cohort}/></Panel>
     </ReportPane>
     </>}
     </div></div>}
   </div>
   <div className="analysis-ai-note"><Info size={16}/><p><b>Does this need AI?</b> Timed tests, answer checking, scoring, journeys, and comparisons work without AI. AI could optionally help draft questions or explanations; a verified answer key and your own question content remain necessary. Live rankings across devices would require a shared results service.</p></div>
   {selected&&<Modal title={`Question ${questionNumbers.get(selected.question.id)} · ${selected.question.subject}`} onClose={()=>setSelected(null)} wide><div className="modal-body analysis-solution"><div className="analysis-solution-meta"><span>{selected.question.chapter} {selected.question.topic&&`/ ${selected.question.topic}`}</span><span>{selected.question.difficulty} · {fmt(selected.timeSeconds)} / {fmt(selected.idealSeconds)} target</span></div><Markdown>{selected.question.prompt}</Markdown><div className="analysis-answer-columns"><div><h3>Your answer</h3><Markdown>{answerText(selected)}</Markdown></div><div><h3>Answer key</h3><Markdown>{answerText(selected,true)}</Markdown></div></div><h3>Explanation</h3><Markdown>{selected.question.explanation||'No explanation was supplied by the question author.'}</Markdown><label className="mt-5">My error category<SmoothSelect value={tags[selected.question.id]||''} onChange={e=>tagQuestion(selected.question.id,e.target.value)}><option value="">Choose a category before capturing</option>{categories.map(category=><option key={category}>{category}</option>)}</SmoothSelect></label></div><footer className="modal-footer"><button className="button secondary" disabled={!tags[selected.question.id]} onClick={()=>captureMistake(selected)}><BookOpen size={15}/>Add to Mistake Book</button><button className="button primary" onClick={()=>{const index=displayRows.findIndex(r=>r.question.id===selected.question.id);setSelected(displayRows[(index+1)%displayRows.length]);}}>Next question<ArrowRight size={15}/></button></footer></Modal>}
   {shareOpen&&<Modal title="Export comparison JSON" onClose={()=>setShareOpen(false)} wide><div className="modal-body"><p className="analysis-muted mb-4">This JSON contains this paper’s actual score, subject scores, and recorded question outcomes. Share it with someone comparing the same paper.</p><label>Recorded result JSON<textarea readOnly rows={12} value={JSON.stringify([resultRecord()],null,2)} spellCheck={false}/></label></div><footer className="modal-footer"><button className="button secondary" onClick={()=>saveFile("comparison-result.json",JSON.stringify([resultRecord()],null,2))}><Download size={14}/>Download JSON</button><button className="button primary" onClick={copyResult}>Copy JSON</button></footer></Modal>}
   {pasteOpen&&<Modal title="Paste actual comparison results" onClose={()=>setPasteOpen(false)} wide><div className="modal-body"><p className="analysis-muted mb-4">Paste exported Verdant analysis JSON or an array of real result records. Summary rows need name, score, timeSeconds, attempted, and correct.</p><label>Results JSON<textarea rows={12} value={pasteText} onChange={e=>setPasteText(e.target.value)} spellCheck={false}/></label>{importError&&<p className="form-error" role="alert">{importError}</p>}</div><footer className="modal-footer"><button className="button secondary" onClick={()=>setPasteOpen(false)}>Cancel</button><button className="button primary" disabled={!pasteText.trim()} onClick={()=>applyCohort(pasteText,'Pasted results.json')}>Import actual results<ArrowRight size={15}/></button></footer></Modal>}
   {leaderboard&&<Modal title="Leaderboard · imported cohort" onClose={()=>setLeaderboard(false)} wide><div className="modal-body"><p className="analysis-muted mb-4">This leaderboard ranks the real records imported for this paper alongside your current attempt. Equal scores share a rank; time is displayed for context.</p>{cohort.length?<Table caption="Imported cohort leaderboard" headers={['Rank','Name','Score','Time','Accuracy']} rows={[...cohort.map((p,i)=>({...p,key:`p${i}`})),{name:'You · this attempt',score:analysis.score,timeSeconds:analysis.timeSeconds,attempted:analysis.attempted,correct:analysis.correct,key:'self'}].sort((a,b)=>b.score-a.score).map((p,_,all)=>[1+all.filter(other=>other.score>p.score).length,p.name,decimal(p.score),fmt(p.timeSeconds),`${decimal(p.attempted?p.correct/p.attempted*100:0)}%`])}/>:<Empty illustration="analytics" title="No peer results imported" description="Open Comparative analysis and import a cohort to see a real leaderboard."/>}</div></Modal>}
 </div>;
}
export default TestAnalysis;
