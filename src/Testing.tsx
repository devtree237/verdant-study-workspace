import { SmoothSelect } from './components/ui/SmoothSelect';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, Copy, Delete, Download, FileJson, FileText, FileUp, Flag, History, Info, Keyboard, Layers3, Leaf, Maximize2, Minimize2, Moon, PanelRightOpen, Pencil, Play, Plus, Save, Search, ShieldCheck, Sun, Trash2, Upload, UserRound, X } from 'lucide-react';
import { uid } from './model';
import type { Resource } from './model';
import { useStore } from './store';
import { Empty, Markdown, Modal, Progress, TimerDigits, duration, gsap, useGSAP } from './ui';
import { StudyIllustration } from './StudyIllustration';
import { analyseAttempt, answerQuestion, clearAnswer, createAttempt, getAttemptOptionOrder, getAttemptQuestions, parsePaperJSON, questionStatus, recordIntegrityEvent, submitAttempt, tickAttempt, toggleReview, validatePaper, visitQuestion } from './testing-model';
import type { TestAttempt, TestPaper, TestQuestion, TestQuestionGroup, TestResponse } from './testing-model';
import { paperComparisonKey, useTestingStore, validateTestingState } from './testing-store';
import { TestAnalysis } from './TestAnalysis';
import { CbtImport } from './CbtImport';
import { DEFAULT_INTEGRITY_POLICY } from './cbt-integrity';
import type { IntegrityPolicy } from './cbt-integrity';
import { IntegrityBanner, IntegrityPolicyFields, IntegritySummary, requestExamFullscreen, useCbtIntegrity } from './CbtIntegrity';
import { applyQuestionGroups, getPaperSections, questionGroupsNeedApply, assertPaperMarking, assertWorkspaceGroupSubjects, assignQuestionRange, createQuestionGroups, inferPaperMarking } from './test-authoring';
import './testing.css';
import './cbt-workspace.css';
import './cbt-exam-refresh.css';

type View = 'library' | 'exam' | 'report';
const stamp = (time: number) => new Date(time).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const timeLabel = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
const blankQuestion = (): TestQuestion => ({ id: uid(), prompt: '', subject: '', chapter: '', topic: '', difficulty: 'Moderate', kind: 'single', options: ['', '', '', ''], correctAnswers: [0], marks: 4, negativeMarks: 1, idealSeconds: 120, explanation: '' });
const download = (name: string, data: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const fileName = (title: string) => title.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'test-paper';
function responseHasAnswer(response?: TestResponse) { return !!response && (Array.isArray(response.value) ? response.value.length > 0 : response.value.trim() !== ''); }

function PaperEditor({ paper, onClose, onSave }: { paper?: TestPaper; onClose: () => void; onSave: (paper: TestPaper) => void }) {
  const { data } = useStore();
  const [title, setTitle] = useState(paper?.title || ''), [description, setDescription] = useState(paper?.description || ''), [minutes, setMinutes] = useState(paper?.durationMinutes || 60);
  const [questions, setQuestions] = useState<TestQuestion[]>(() => paper ? structuredClone(paper.questions) : [{...blankQuestion(),correctAnswers:[]}]);
  const [groups, setGroups] = useState<TestQuestionGroup[]>(() => createQuestionGroups(questions,paper?.groups));
  const [initialScoring] = useState(() => inferPaperMarking(questions));
  const [marking, setMarking] = useState(() => paper?.marking || initialScoring.marking), [markingLocked,setMarkingLocked] = useState(!!paper?.marking), [normalizeAcknowledged,setNormalizeAcknowledged] = useState(false);
  const [active,setActive] = useState(0), [error,setError] = useState(''), [preview,setPreview] = useState(false), [status,setStatus] = useState('');
  const [ranges,setRanges] = useState<Record<string,{from:string;to:string}>>({});
  const [appliedGroups,setAppliedGroups] = useState(() => JSON.stringify(groups));
  const pendingGroups = JSON.stringify(groups) !== appliedGroups && questionGroupsNeedApply(questions,groups,marking);
  const question = questions[active], currentGroup = groups.find(group=>group.questionIds.includes(question.id)) || groups[0];
  const sourceVariants = [...new Set((paper?.questions || []).map(question=>'+'+question.marks+' / −'+question.negativeMarks))];
  function change(patch:Partial<TestQuestion>){setQuestions(items=>items.map((item,index)=>index===active?{...item,...patch}:item));setError('');}
  function changeGroup(id:string,patch:Partial<TestQuestionGroup>){setGroups(items=>items.map(group=>group.id===id?{...group,...patch}:group));setError('');setStatus('');}
  function ensureNormalization(){if(initialScoring.mixed&&!normalizeAcknowledged&&!markingLocked)throw new Error('Confirm replacing the legacy mixed scores with one fixed scheme before deciding it.');assertPaperMarking(marking);}
  function lockMarking(){try{ensureNormalization();setQuestions(items=>items.map(item=>({...item,...marking})));setMarkingLocked(true);setStatus('Marking is fixed for every question in this paper.');setError('');}catch(error){setError(error instanceof Error?error.message:'Check the marking scheme.');}}
  function applyGroups(){try{ensureNormalization();assertWorkspaceGroupSubjects(groups,data.subjects.map(subject=>subject.name));setQuestions(items=>applyQuestionGroups(items,groups,marking));setAppliedGroups(JSON.stringify(groups));setMarkingLocked(true);setPreview(false);setError('');setStatus('Group settings applied. Review any answer keys cleared by a change of answer type.');}catch(error){setError(error instanceof Error?error.message:'Check the group settings.');}}
  function save(){try{
    if(!markingLocked)throw new Error('Decide the paper marking scheme before saving.');
    const activeGroups=groups.filter(group=>group.questionIds.length);assertWorkspaceGroupSubjects(activeGroups,data.subjects.map(subject=>subject.name));
    const normalized=applyQuestionGroups(questions,activeGroups,marking);setQuestions(normalized);setAppliedGroups(JSON.stringify(groups));
    const now=Date.now();let next=validatePaper({id:paper?.id||uid(),title:title.trim(),description:description.trim(),durationMinutes:minutes,questions:normalized,groups:activeGroups,marking,createdAt:paper?.createdAt||now,updatedAt:now});
    if(paper&&paperComparisonKey(next)!==paperComparisonKey(paper))next={...next,id:uid(),createdAt:now};onSave(next);
  }catch(error){setError(error instanceof Error?error.message:'Check the paper and try again.');}}
  function addQuestion(groupId=currentGroup.id){const group=groups.find(group=>group.id===groupId);if(!group||questions.length>=1000)return;const next={...blankQuestion(),subject:group.subject,kind:group.kind,options:group.kind==='numeric'?[]:['','','',''],correctAnswers:[],...marking};setQuestions(items=>[...items,next]);setGroups(items=>items.map(item=>item.id===groupId?{...item,questionIds:[...item.questionIds,next.id]}:item));setActive(questions.length);setPreview(false);}
  function addGroup(){setGroups(items=>[...items,{id:uid(),name:'Group '+(items.length+1),subject:'',kind:'single',questionIds:[]}]);setStatus('Choose a subject and answer type, then add questions or assign a range.');}
  function assignRange(id:string){try{const range=ranges[id]||{from:'',to:''};setGroups(assignQuestionRange(questions,groups,id,Number(range.from),Number(range.to)));setError('');setStatus('Range assigned. Apply group settings to update its questions.');}catch(error){setError(error instanceof Error?error.message:'Check the question range.');}}
  function duplicate(){if(questions.length>=1000){setError('A paper supports at most 1,000 questions.');return;}const copy={...structuredClone(question),id:uid()};setQuestions(items=>[...items.slice(0,active+1),copy,...items.slice(active+1)]);setGroups(items=>items.map(group=>group.id===currentGroup.id?{...group,questionIds:[...group.questionIds.slice(0,group.questionIds.indexOf(question.id)+1),copy.id,...group.questionIds.slice(group.questionIds.indexOf(question.id)+1)]}:group));setActive(active+1);setPreview(false);}
  return <Modal title={paper?'Edit test paper':'Create a test paper'} onClose={onClose} wide><div className="test-editor grouped-authoring">
    <div className="test-editor-details"><label>Paper title<input value={title} maxLength={200} onChange={event=>setTitle(event.target.value)} placeholder="Name your test" required/></label><label>Instructions<textarea rows={2} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Syllabus, permitted tools, or other instructions"/></label><label>Duration in minutes<input type="number" min={1} max={1440} value={minutes} onChange={event=>setMinutes(Number(event.target.value))}/></label></div>
    <section className={'paper-marking '+(markingLocked?'locked':'')} aria-label="Paper marking scheme"><div><span className="eyebrow">ONE SCHEME FOR THE WHOLE PAPER</span><h3>{markingLocked?'Marking decided':'Decide your marking once'}</h3><p>Every question uses the same marks. Unanswered questions score zero. Once decided, the scheme stays fixed.</p></div>{markingLocked?<div className="paper-fixed-marking"><span><b>+{marking.marks}</b> correct</span><span><b>−{marking.negativeMarks}</b> incorrect</span><small><ShieldCheck size={12}/>Fixed for all {questions.length} questions</small></div>:<div className="paper-marking-fields"><label>Correct answer<input aria-label="Paper correct-answer marks" type="number" min={.001} max={100000} step="any" value={marking.marks} onChange={event=>setMarking(value=>({...value,marks:Number(event.target.value)}))}/></label><label>Wrong-answer penalty<input aria-label="Paper wrong-answer penalty" type="number" min={0} max={100000} step="any" value={marking.negativeMarks} onChange={event=>setMarking(value=>({...value,negativeMarks:Number(event.target.value)}))}/></label><button className="button secondary small" onClick={lockMarking}><ShieldCheck size={13}/>Decide marking</button></div>}</section>
    {initialScoring.mixed&&!markingLocked&&<div className="paper-legacy-scoring"><p>This older paper uses different scores: {sourceVariants.join(', ')}. Its saved questions and previous attempts have not changed.</p><label><input type="checkbox" checked={normalizeAcknowledged} onChange={event=>setNormalizeAcknowledged(event.target.checked)}/><span>I agree to apply +{marking.marks} / −{marking.negativeMarks} to every question when I decide this paper’s scheme.</span></label></div>}
    <section className="paper-groups"><header><div><span className="eyebrow">QUESTION GROUPS</span><h3>Set the subject and answer type for a group.</h3><p>Add questions directly, or assign a numbered range. Subject choices come from your workspace.</p></div><button className="button secondary small" onClick={addGroup}><Plus size={13}/>Add group</button></header>
    {!data.subjects.length&&<p className="paper-authoring-warning"><Info size={14}/>Add a subject in your workspace before saving a paper.</p>}
    <div className="paper-group-list">{groups.map(group=>{const numbers=group.questionIds.map(id=>questions.findIndex(question=>question.id===id)+1).filter(number=>number>0).sort((a,b)=>a-b),range=ranges[group.id]||{from:'',to:''},unavailable=group.subject&&!data.subjects.some(subject=>subject.name===group.subject);return <article className="paper-group-card" key={group.id}><div className="paper-group-fields"><label>Group name<input aria-label={'Name for '+group.name} value={group.name} maxLength={120} onChange={event=>changeGroup(group.id,{name:event.target.value})}/></label><label>Workspace subject<SmoothSelect aria-label={'Subject for '+group.name} value={group.subject} onChange={event=>changeGroup(group.id,{subject:event.target.value})}><option value="">Choose a subject</option>{unavailable&&<option disabled value={group.subject}>{group.subject} · unavailable</option>}{data.subjects.map(subject=><option key={subject.id} value={subject.name}>{subject.name}</option>)}</SmoothSelect></label><label>Answer type<SmoothSelect aria-label={'Answer type for '+group.name} value={group.kind} onChange={event=>changeGroup(group.id,{kind:event.target.value as TestQuestion['kind']})}><option value="single">Single correct option</option><option value="multiple">Multiple correct options</option><option value="numeric">Numerical answer</option></SmoothSelect></label><button className="icon-btn" disabled={groups.length===1||group.questionIds.length>0} title="Move this group’s questions to another group before removing it" aria-label={'Remove '+group.name} onClick={()=>setGroups(items=>items.filter(item=>item.id!==group.id))}><Trash2 size={14}/></button></div><div className="paper-group-members"><span>{numbers.length?numbers.length+' questions · '+numbers.map(number=>'Q'+number).join(', '):'No questions assigned yet'}</span><button className="text-link" onClick={()=>addQuestion(group.id)}><Plus size={12}/>Add question here</button><div><label>From<input aria-label={'First question for '+group.name} type="number" min={1} max={questions.length} value={range.from} onChange={event=>setRanges(items=>({...items,[group.id]:{...range,from:event.target.value}}))}/></label><label>To<input aria-label={'Last question for '+group.name} type="number" min={1} max={questions.length} value={range.to} onChange={event=>setRanges(items=>({...items,[group.id]:{...range,to:event.target.value}}))}/></label><button className="button secondary small" onClick={()=>assignRange(group.id)}>Assign range</button></div></div></article>;})}</div>
    <footer><p>Changing between numerical and choice answers clears incompatible keys. Review answers after applying. Test questions follow the listed group order; ranges use the review numbers. Empty groups are not saved.</p><button className="button secondary small" disabled={!data.subjects.length} onClick={applyGroups}><Check size={13}/>{markingLocked?'Apply group settings':'Apply groups & decide marking'}</button></footer></section>
    {pendingGroups&&<p className="paper-authoring-warning"><Info size={14}/>Group changes are pending. Apply them to update existing question subjects and answer controls.</p>}
    {status&&<p className="paper-authoring-status" role="status"><CheckCircle2 size={13}/>{status}</p>}
    <div className="test-editor-workspace"><aside className="test-editor-index"><span className="eyebrow">YOUR QUESTIONS</span>{groups.map(group=><div className="paper-index-group" key={group.id}><h4>{group.name}<small>{group.subject||'Subject not selected'}</small></h4>{group.questionIds.map(id=>{const index=questions.findIndex(question=>question.id===id),item=questions[index];if(!item)return null;return <button key={id} className={active===index?'active':''} onClick={()=>{setActive(index);setPreview(false);}}><span>{index+1}</span><b>{item.prompt.trim()||'Untitled question'}</b>{item.prompt.trim()&&<Check size={12}/>}</button>;})}</div>)}<button className="test-add-question" onClick={()=>addQuestion()}><Plus size={14}/>Add question</button></aside>
    <section className="test-question-editor question-editor" key={question.id}><div className="test-question-editor-title"><div><h3>Question {active+1}</h3><small className="paper-question-group">{currentGroup.name} · {question.subject||'Apply a subject'} · {question.kind==='numeric'?'Numerical':question.kind==='multiple'?'Multiple correct':'Single correct'}</small></div><div><button className="button secondary small" onClick={()=>setPreview(!preview)}>{preview?'Edit question':'Preview'}</button><button className="icon-btn" aria-label="Duplicate question" onClick={duplicate}><Copy size={15}/></button><button className="icon-btn" aria-label="Delete question" disabled={questions.length===1} onClick={()=>{setQuestions(items=>items.filter((_,index)=>index!==active));setGroups(items=>items.map(group=>({...group,questionIds:group.questionIds.filter(id=>id!==question.id)})));setActive(Math.max(0,active-1));}}><Trash2 size={15}/></button></div></div>
    {preview?<div className="test-question-preview"><Markdown>{question.prompt||'Write the question to see its preview.'}</Markdown>{question.kind==='numeric'?<p>Numerical answer: <b>{question.numericAnswer??'Not set'}</b> · tolerance ±{question.tolerance||0}</p>:question.options.map((option,index)=><div className={'test-preview-option '+(question.correctAnswers.includes(index)?'correct':'')} key={index}><b>{String.fromCharCode(65+index)}</b><Markdown>{option||'Empty option'}</Markdown>{question.correctAnswers.includes(index)&&<Check size={15}/>}</div>)}{question.explanation&&<div className="test-answer-explanation"><Markdown>{question.explanation}</Markdown></div>}</div>:<>
    <label>Question · Markdown, LaTeX and MathML<textarea rows={5} value={question.prompt} onChange={event=>change({prompt:event.target.value})} placeholder="Write the full question. Use $...$ for maths, or paste a complete <math>...</math> fragment."/></label>
    {question.kind==='numeric'?<div className="test-form-grid"><label>Correct numerical answer<input type="number" step="any" value={question.numericAnswer??''} onChange={event=>change({numericAnswer:event.target.value===''?undefined:Number(event.target.value)})}/></label><label>Accepted tolerance (±)<input type="number" min={0} step="any" value={question.tolerance||0} onChange={event=>change({tolerance:Number(event.target.value)})}/></label></div>:<fieldset className="test-option-editor"><legend>{question.kind==='single'?'Select the correct option':'Select every correct option'}</legend>{question.options.map((option,index)=><div key={index}><input aria-label={'Option '+String.fromCharCode(65+index)+' is correct'} type={question.kind==='single'?'radio':'checkbox'} name={'correct-'+question.id} checked={question.correctAnswers.includes(index)} onChange={()=>change({correctAnswers:question.kind==='single'?[index]:question.correctAnswers.includes(index)?question.correctAnswers.filter(value=>value!==index):[...question.correctAnswers,index].sort((a,b)=>a-b)})}/><span>{String.fromCharCode(65+index)}</span><textarea aria-label={'Option '+String.fromCharCode(65+index)} rows={1} value={option} onChange={event=>change({options:question.options.map((value,position)=>position===index?event.target.value:value)})}/><button className="icon-btn" aria-label={'Delete option '+String.fromCharCode(65+index)} disabled={question.options.length<=2} onClick={()=>change({options:question.options.filter((_,position)=>position!==index),correctAnswers:question.correctAnswers.filter(value=>value!==index).map(value=>value>index?value-1:value)})}><X size={14}/></button></div>)}<button className="text-link" disabled={question.options.length>=20} onClick={()=>change({options:[...question.options,'']})}><Plus size={13}/>Add option</button></fieldset>}
    <p className="test-field-hint">Marking: +{marking.marks} correct / −{marking.negativeMarks} incorrect. Multiple-correct answers require an exact match. Unanswered questions score zero.</p><label>Solution and explanation<textarea rows={4} value={question.explanation} onChange={event=>change({explanation:event.target.value})} placeholder="Explain the method for post-test review."/></label></>}
    </section></div>{error&&<p className="test-error" role="alert">{error}</p>}
  </div><footer className="modal-footer"><span className="test-footer-count">{questions.length} questions · {groups.filter(group=>group.questionIds.length).length} groups · {questions.length*marking.marks} marks</span><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!data.subjects.length||!markingLocked} onClick={save}><Save size={15}/>Save paper</button></footer></Modal>;
}

function ResourceImport({ onClose, onImport }: { onClose: () => void; onImport: (paper: TestPaper) => void }) {
  const { data } = useStore();
  const resources = data.resources.filter(resource => !!resource.questions?.length);
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [marking,setMarking]=useState({marks:4,negativeMarks:1});
  const [error, setError] = useState('');
  function importQuestions() {
    try {
      const selected = resources.filter(resource => chosen.includes(resource.id));
      if (!selected.length) throw new Error('Select at least one material with practice questions.');
      if(selected.some(resource=>!data.subjects.some(subject=>subject.id===resource.subject)))throw new Error('Choose an existing workspace subject for each selected material before creating a paper.');
      assertPaperMarking(marking);
      const now = Date.now();
      const questions = selected.flatMap((resource: Resource) => resource.questions!.map(question => ({ ...blankQuestion(), prompt: question.prompt, subject: data.subjects.find(subject => subject.id === resource.subject)?.name || '', topic: resource.title, ...marking, options: question.options, correctAnswers: [question.answer], explanation: question.explanation })));
      onImport(validatePaper({ id: uid(), title: title.trim() || selected.map(resource => resource.title).join(' + '), description: 'Practice questions from your Resource Vault.', durationMinutes: minutes, questions,groups:createQuestionGroups(questions),marking,createdAt: now, updatedAt: now }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The selected questions could not be imported.'); }
  }
  return <Modal title="Use questions from your materials" onClose={onClose}><div className="modal-body"><p className="test-field-hint">Create a timed paper from practice questions you have already written in the Resource Vault.</p>{!resources.length ? <Empty illustration="materials" title="Add your questions first" description="Edit a resource and add practice questions. They will appear here when they have an answer key." /> : <><label>Paper title<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Optional · defaults to material titles" /></label><label className="test-label-gap">Duration in minutes<input type="number" min={1} max={1440} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label><div className="test-form-grid"><label>Correct-answer marks<input type="number" min={.001} step="any" value={marking.marks} onChange={event=>setMarking(value=>({...value,marks:Number(event.target.value)}))}/></label><label>Wrong-answer penalty<input type="number" min={0} step="any" value={marking.negativeMarks} onChange={event=>setMarking(value=>({...value,negativeMarks:Number(event.target.value)}))}/></label></div><p className="test-field-hint">This marking scheme is fixed for every question when you create the paper.</p><div className="test-resource-choices">{resources.map(resource => <label key={resource.id}><input type="checkbox" checked={chosen.includes(resource.id)} onChange={() => setChosen(items => items.includes(resource.id) ? items.filter(id => id !== resource.id) : [...items, resource.id])} /><span><b>{resource.title}</b><small>{resource.questions!.length} questions · {data.subjects.find(subject => subject.id === resource.subject)?.name || ''}</small></span></label>)}</div></>}{error && <p className="test-error" role="alert">{error}</p>}</div><footer className="modal-footer"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!chosen.length} onClick={importQuestions}>Create paper<ArrowRight size={15} /></button></footer></Modal>;
}

type BeginOptions = { candidateName?: string; integrityPolicy: IntegrityPolicy };
function CbtStartPaper({ paper, onClose, onStart }: { paper: TestPaper; onClose: () => void; onStart: (options: BeginOptions) => void }) {
  const [candidateName, setCandidateName] = useState('');
  const [policy, setPolicy] = useState<IntegrityPolicy>({ ...DEFAULT_INTEGRITY_POLICY });
  const [acknowledged, setAcknowledged] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const sections = getPaperSections(paper);
  async function begin() {
    if (!acknowledged || busy) return;
    setError(''); setBusy(true);
    const result = await requestExamFullscreen(policy);
    if (!alive.current) { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); return; }
    if (!result.ok) { setError(result.message || 'Fullscreen could not start. Choose practice mode or allow fullscreen to continue.'); setBusy(false); return; }
    onStart({ ...(candidateName.trim() ? { candidateName: candidateName.trim() } : {}), integrityPolicy: policy });
  }
  return (
    <div className="cbt-preflight-stage">
      <Modal title={paper.title} onClose={onClose} wide>
        <div className="cbt-preflight">
          <div className="cbt-preflight-facts">
            <span><Layers3 size={16}/><b>{paper.questions.length}</b> questions</span>
            <span><Clock3 size={16}/><b>{paper.durationMinutes}</b> minutes</span>
            <span><Flag size={16}/><b>{paper.questions.reduce((sum, question) => sum + question.marks, 0)}</b> marks</span>
          </div>
          <div className="cbt-preflight-grid">
            <section>
              <h3>Instructions</h3>
              <ul className="cbt-preflight-rules">
                <li>The countdown starts when you begin and keeps running through reloads or interruptions.</li>
                <li>Your answers save as you work. Use the section tabs, question palette or Save &amp; next to move.</li>
                <li>Each question shows the marks for a correct answer and the penalty for a wrong answer. Multiple-correct answers require an exact match. Unanswered questions score zero.</li>
                <li>Questions marked for review are scored using their saved answer. Submission is final and happens automatically when time runs out.</li>
              </ul>
              {paper.description && <div className="cbt-paper-description"><h3>Paper instructions</h3><Markdown>{paper.description}</Markdown></div>}
              <p className="cbt-preflight-note"><Info size={16}/>This is personal practice. Papers, answer keys and responses are stored in this browser and can be inspected on this device. Browser checks cannot prevent every form of cheating.</p>
            </section>
            <section className="cbt-preflight-policy">
              <label>Candidate name <span className="cbt-optional">optional</span>
                <input value={candidateName} onChange={event => setCandidateName(event.target.value)} placeholder="Your name for this attempt" maxLength={100} disabled={busy}/>
              </label>
              <h3>Your sections</h3>
              <div className="cbt-preflight-sections">
                {sections.map(({ id, name, subject, questions }) => (
                  <div key={id}>
                    <span>{name}{name !== subject && <small> · {subject}</small>}</span>
                    <b>{questions.length} Qs</b>
                    <small>{questions.reduce((sum, question) => sum + question.marks, 0)} marks</small>
                  </div>
                ))}
              </div>
              <IntegrityPolicyFields policy={policy} onChange={setPolicy} disabled={busy}/>
            </section>
          </div>
          <label className="cbt-acknowledgement">
            <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={busy}/>
            <span>I have read the instructions and understand the selected session rules.</span>
          </label>
          {error && <p className="test-error" role="alert">{error}</p>}
        </div>
        <footer className="modal-footer">
          <button className="button primary" disabled={!acknowledged || busy} onClick={() => void begin()}><Play size={15}/>{busy ? 'Starting session…' : 'Begin test'}</button>
          <button className="button secondary" disabled={busy} onClick={onClose}>Go back</button>
        </footer>
      </Modal>
    </div>
  );
}

function CbtSubmitConfirmation({ attempt, onClose, onSubmit }: { attempt: TestAttempt; onClose:()=>void; onSubmit:()=>void }) {
  const questions=getAttemptQuestions(attempt), sections=getPaperSections(attempt.paper,questions);
  const answered=questions.filter(q=>responseHasAnswer(attempt.responses[q.id])).length;
  const unanswered=questions.length-answered;
  const marked=questions.filter(q=>attempt.responses[q.id]?.markedReview).length;
  const notVisited=questions.filter(q=>!attempt.responses[q.id]?.visited).length;
  return <Modal title="Review your submission" onClose={onClose} wide><div className="cbt-submit-summary"><span className="cbt-kicker"><CheckCircle2 size={14}/>FINAL CHECK</span><h2>{attempt.paper.title}</h2><p>Your responses become final when you submit. You can then review the answer key and your recorded test analysis.</p><div className="cbt-submit-totals"><div><b>{answered}</b><span>Answered</span></div><div><b>{unanswered}</b><span>Unanswered</span></div><div><b>{marked}</b><span>Marked for review</span></div><div><b>{notVisited}</b><span>Not visited</span></div></div>{unanswered>0&&<div className="cbt-unanswered-warning"><Info size={16}/><span><b>{unanswered} question{unanswered===1?' is':'s are'} unanswered.</b> They will receive zero marks. You can return to the test before submitting.</span></div>}<div className="cbt-summary-table"><table><thead><tr><th>Section</th><th>Answered</th><th>Unanswered</th><th>Review</th></tr></thead><tbody>{sections.map(group=>{const section=group.questions,done=section.filter(q=>responseHasAnswer(attempt.responses[q.id])).length;return <tr key={group.id}><th>{group.name}</th><td>{done} / {section.length}</td><td>{section.length-done}</td><td>{section.filter(q=>attempt.responses[q.id]?.markedReview).length}</td></tr>;})}</tbody></table></div><p className="cbt-submit-note">Review counts include answered questions. Every marked question uses its saved answer for scoring.</p></div><footer className="modal-footer"><button className="button secondary" onClick={onClose}>Return to test</button><button className="button primary" onClick={onSubmit}><CheckCircle2 size={15}/>Submit final answers</button></footer></Modal>;
}

export function CbtExamWorkspace({ attempt, onChange, onSubmit, onLibrary, storageError }: { attempt:TestAttempt; onChange:(fn:(attempt:TestAttempt)=>TestAttempt)=>void; onSubmit:(reason?:'manual'|'integrity')=>void; onLibrary:()=>void; storageError:string }) {
  const [subject,setSubject]=useState<string|null>(null), [palette,setPalette]=useState(false), [confirm,setConfirm]=useState(false), [instructions,setInstructions]=useState(false), [overview,setOverview]=useState(false), [leaving,setLeaving]=useState(false);
  const [expanded,setExpanded]=useState(true), [examTheme,setExamTheme]=useState(document.documentElement.dataset.theme==='dark'?'dark':'light'), [paletteFilter,setPaletteFilter]=useState('all');
  const panel=useRef<HTMLDivElement>(null), questionBody=useRef<HTMLDivElement>(null), numericInput=useRef<HTMLInputElement>(null);
  const presented=getAttemptQuestions(attempt), sections=getPaperSections(attempt.paper,presented);
  const filtered=subject===null?presented:sections.find(section=>section.id===subject)?.questions||[];
  const question=presented.find(q=>q.id===attempt.currentQuestionId)||presented[0], index=presented.findIndex(q=>q.id===question.id), filteredIndex=filtered.findIndex(q=>q.id===question.id), response=attempt.responses[question.id];
  const [numericDraft,setNumericDraft]=useState(typeof response?.value==='string'?response.value:'');
  useEffect(()=>{setNumericDraft(typeof response?.value==='string'?response.value:'');questionBody.current?.scrollTo({top:0,left:0});},[question.id]);
  const policy=attempt.integrity?.policy||{...DEFAULT_INTEGRITY_POLICY};
  const guard=useCbtIntegrity({attemptId:attempt.id,active:attempt.status==='running',policy,events:attempt.integrity?.events||[],questionId:question.id,onEvent:event=>onChange(current=>recordIntegrityEvent(current,event)),onAutoSubmit:()=>onSubmit('integrity'),suspended:confirm||instructions||overview||leaving});
  const locked=policy.mode==='guarded'&&policy.requireFullscreen&&guard.status!=='ready';
  useEffect(()=>{if(locked){setOverview(false);setPalette(false);}},[locked]);
  const seconds=Math.ceil(Math.max(0,attempt.deadlineAt-Date.now())/1000), elapsed=Math.max(0,Date.now()-attempt.startedAt), durationMs=Math.max(1,attempt.deadlineAt-attempt.startedAt);
  const answered=presented.filter(q=>responseHasAnswer(attempt.responses[q.id])).length;
  const selected=Array.isArray(response?.value)?response.value:[], optionOrder=getAttemptOptionOrder(attempt,question.id);
  const statuses={unvisited:'Not visited',unanswered:'Not answered',answered:'Answered',review:'Marked for review','answered-review':'Answered & marked'};
  const statusCount=(key:string)=>presented.filter(q=>questionStatus(q,attempt.responses[q.id])===key).length;
  const paletteQuestions=filtered.filter(q=>paletteFilter==='all'||questionStatus(q,attempt.responses[q.id])===paletteFilter);
  useLayoutEffect(() => {
    if (!expanded) return;
    const app = document.getElementById('root');
    const wasInert = app?.inert ?? false;
    if (app) app.inert = true;
    panel.current?.focus({ preventScroll: true });
    return () => { if (app) app.inert = wasInert; };
  }, [expanded]);
  useGSAP(()=>{gsap.fromTo('.cbt-question-content',{opacity:0,y:7},{opacity:1,y:0,duration:duration(.24),ease:'expo.out',clearProps:'opacity,transform'});},{scope:panel,dependencies:[question.id,expanded],revertOnUpdate:true});
  function navigate(id:string){if(locked)return;onChange(current=>visitQuestion(current,id,Date.now()));setPalette(false);}
  function next(){if(filteredIndex<filtered.length-1)navigate(filtered[filteredIndex+1].id);else setConfirm(true);}
  function choose(canonical:number){const value=question.kind==='single'?[canonical]:selected.includes(canonical)?selected.filter(i=>i!==canonical):[...selected,canonical].sort((a,b)=>a-b);onChange(current=>answerQuestion(current,question.id,value,Date.now()));}
  function numeric(value:string){if(!/^[+\-\d.eE]*$/.test(value)||value.length>100)return;setNumericDraft(value);const valid=value===''||/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)&&Number.isFinite(Number(value));onChange(current=>answerQuestion(current,question.id,valid?value:'',Date.now()));}
  function keyNumber(key:string){if(key==='clear'){numeric('');return;}if(key==='sign'){numeric(numericDraft.startsWith('-')?numericDraft.slice(1):`-${numericDraft}`);return;}const input=numericInput.current,from=input?.selectionStart??numericDraft.length,to=input?.selectionEnd??from;const value=key==='backspace'?numericDraft.slice(0,Math.max(0,from-(from===to?1:0)))+numericDraft.slice(to):numericDraft.slice(0,from)+key+numericDraft.slice(to);numeric(value);window.requestAnimationFrame(()=>{input?.focus();const position=key==='backspace'?Math.max(0,from-(from===to?1:0)):from+key.length;input?.setSelectionRange(position,position);});}
  function markAndNext(){if(!response?.markedReview)onChange(current=>toggleReview(current,question.id,Date.now()));next();}
  function leave(){guard.runTrustedAction(()=>{if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});onLibrary();});}
  const workspace=<div className={`exam-workspace cbt-shell ${expanded?'is-expanded':''}`} data-cbt-exam data-cbt-theme={examTheme} ref={panel} tabIndex={-1} role="region" aria-label="Computer-based test workspace" onKeyDown={event=>{const target=event.target as HTMLElement,editing=target.matches('input,textarea,select,[contenteditable=true]');if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'||!editing&&['q','?'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();}}}>
    <header className="cbt-topbar">
      <div className="cbt-test-heading">
        <span className="cbt-test-icon" aria-hidden="true"><Leaf size={19}/></span>
        <b title={attempt.paper.title}>{attempt.paper.title}</b>
      </div>
      <div className="cbt-sections-row">
        <div role="tablist" aria-label="Test question groups">
          <button role="tab" aria-selected={subject === null} className={subject === null ? 'active' : ''} onClick={() => setSubject(null)} disabled={locked}>All questions <b>{answered}/{presented.length}</b></button>
          {sections.map(section => {
            const items = section.questions;
            const done = items.filter(item => responseHasAnswer(attempt.responses[item.id])).length;
            return <button key={section.id} role="tab" aria-selected={subject === section.id} className={subject === section.id ? 'active' : ''} disabled={locked} onClick={() => {
              setSubject(section.id);
              if (!items.some(item => item.id === question.id)) navigate(items[0].id);
            }}>{section.name}<b>{done}/{items.length}</b></button>;
          })}
        </div>
        <button className={`cbt-palette-toggle ${palette ? 'active' : ''}`} aria-expanded={palette} aria-label="Toggle question palette" onClick={() => setPalette(!palette)}><PanelRightOpen size={16}/><span>Questions</span></button>
      </div>
      <div className={`cbt-timer ${seconds < 300 ? 'urgent' : ''}`} role="timer" aria-label={`${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`}>
        <span>Time left</span>
        <b><TimerDigits value={`${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${timeLabel(seconds % 3600)}`}/></b>
        <div aria-hidden="true"><i style={{ width: `${Math.max(0, 100 - elapsed / durationMs * 100)}%` }}/></div>
      </div>
      <div className="cbt-top-actions">
        <button aria-label={examTheme === 'dark' ? 'Switch exam to light theme' : 'Switch exam to dark theme'} title="Exam theme" onClick={() => setExamTheme(examTheme === 'dark' ? 'light' : 'dark')}>{examTheme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button>
        {policy.mode === 'practice' && <button aria-label={expanded ? 'Collapse exam workspace' : 'Expand exam workspace'} title={expanded ? 'Collapse workspace' : 'Expand workspace'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}</button>}
        <button className="cbt-submit-button cbt-submit-compact" aria-label="Review submission" onClick={() => setConfirm(true)}><Check size={15}/><span>Submit</span></button>
      </div>
    </header>
    <div className="cbt-session-strip">
      <span className={`cbt-save-state ${storageError ? 'error' : ''}`}>{storageError ? <Info size={13}/> : <CheckCircle2 size={13}/>} {storageError ? 'Saving needs attention' : 'Responses saved on this browser'}</span>
      <span className="cbt-candidate"><UserRound size={14}/> <span>{attempt.candidateName || 'Your attempt'}</span></span>
      <div className="cbt-session-tools">
        <button onClick={() => guard.runTrustedAction(() => setInstructions(true))}><FileText size={13}/>Instructions</button>
        <button disabled={locked} onClick={() => guard.runTrustedAction(() => setOverview(true))}><BookOpen size={13}/>Question paper</button>
        {policy.mode === 'practice' && <button onClick={() => setLeaving(true)}><ArrowLeft size={13}/>Test Centre</button>}
      </div>
    </div>
    {storageError && <div className="cbt-storage-error" role="alert">{storageError}</div>}
    <IntegrityBanner controller={guard} policy={policy}/>
    <div className="cbt-main"><section className="cbt-question-area"><div className="cbt-question-heading"><div><span>QUESTION {index+1}</span><small>of {presented.length}</small><b>{question.kind==='single'?'Single correct':question.kind==='multiple'?'Multiple correct':'Numerical answer'}</b></div><div><span>Marks</span><b className="cbt-positive">+{question.marks}</b><b className="cbt-negative">−{question.negativeMarks}</b><i/><span><Clock3 size={11}/>{timeLabel(response?.seconds||0)}</span></div></div><div className="cbt-question-scroll" ref={questionBody}>{locked?<div className="cbt-locked"><ShieldCheck size={35}/><h2>Return to fullscreen to continue</h2><p>Your saved responses are safe. The countdown keeps running while integrity checks wait for fullscreen.</p><button className="button primary" onClick={()=>void guard.startGuard()}><Maximize2 size={15}/>Return to fullscreen</button></div>:<div className="cbt-question-content"><div className="cbt-subject-label">{question.subject}{question.chapter&&<><ChevronRight size={11}/>{question.chapter}</>}</div><div className="cbt-question-stem"><Markdown>{question.prompt}</Markdown></div>{question.kind==='numeric'?<div className="cbt-numeric-area"><div><label htmlFor="cbt-numeric-response">Your numerical response</label><input id="cbt-numeric-response" ref={numericInput} inputMode="decimal" autoComplete="off" value={numericDraft} maxLength={100} placeholder="Enter your answer" onChange={event=>numeric(event.target.value)}/><p>{numericDraft&&(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(numericDraft)||!Number.isFinite(Number(numericDraft)))?'Complete the number to save your response.':'Decimals and negative values are supported. A valid entry saves as you type.'}</p></div><div className="cbt-keypad" aria-label="Numerical answer keypad">{['7','8','9','4','5','6','1','2','3','sign','0','.'].map(key=><button key={key} type="button" aria-label={key==='sign'?'Change answer sign':`Enter ${key}`} onClick={()=>keyNumber(key)}>{key==='sign'?'±':key}</button>)}<button className="wide" onClick={()=>keyNumber('backspace')} aria-label="Backspace numerical answer"><Delete size={16}/>Delete</button><button onClick={()=>keyNumber('clear')}>Clear</button></div></div>:<div className="cbt-options" role={question.kind==='single'?'radiogroup':'group'} aria-label="Answer options">{optionOrder.map((canonical,displayIndex)=><button key={canonical} role={question.kind==='single'?'radio':'checkbox'} aria-checked={selected.includes(canonical)} tabIndex={question.kind==='single'?(selected.includes(canonical)||!selected.length&&displayIndex===0?0:-1):0} className={`cbt-option ${selected.includes(canonical)?'selected':''}`} onClick={()=>choose(canonical)} onKeyDown={event=>{if(question.kind!=='single'||!['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const nextIndex=event.key==='Home'?0:event.key==='End'?optionOrder.length-1:(displayIndex+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)+optionOrder.length)%optionOrder.length;choose(optionOrder[nextIndex]);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('.cbt-option')[nextIndex]?.focus();}}><span className={`cbt-option-marker ${question.kind==='multiple'?'square':''}`}>{selected.includes(canonical)?<Check size={14}/>:String.fromCharCode(65+displayIndex)}</span><Markdown>{question.options[canonical]}</Markdown></button>)}</div>}{question.kind==='multiple'&&<p className="cbt-answer-hint"><Info size={12}/>Select every correct option. All correct choices are required.</p>}</div>}</div><footer className="cbt-question-actions"><div><button className={`cbt-review-button ${response?.markedReview?'marked':''}`} disabled={locked} aria-pressed={!!response?.markedReview} onClick={()=>onChange(current=>toggleReview(current,question.id,Date.now()))}><Bookmark size={15} fill={response?.markedReview?'currentColor':'none'}/>{response?.markedReview?'Unmark review':'Mark for review'}</button><button className="cbt-clear-button" disabled={locked||!responseHasAnswer(response)&&!(question.kind==='numeric'&&numericDraft)} onClick={()=>{setNumericDraft('');onChange(current=>clearAnswer(current,question.id,Date.now()));}}>Clear response</button></div><div><button className="cbt-previous-button" disabled={locked||filteredIndex<=0} onClick={()=>navigate(filtered[filteredIndex-1].id)}><ArrowLeft size={14}/>Previous</button><button className="cbt-review-next" disabled={locked} onClick={markAndNext}>Mark review & next<ChevronRight size={14}/></button><button className="cbt-next-button" disabled={locked} onClick={next}>{filteredIndex===filtered.length-1?'Review & submit':'Save & next'}<ArrowRight size={14}/></button></div></footer></section>
      <aside className={`cbt-question-palette ${palette ? 'open' : ''}`} aria-label="Question palette">
        <div className="cbt-palette-scroll">
          <div className="cbt-palette-heading">
            <div>
              <h2>{sections.find(section => section.id === subject)?.name || 'All questions'}</h2>
              <p>{answered} of {presented.length} answered</p>
            </div>
            <button aria-label="Close question palette" onClick={() => setPalette(false)}><X size={17}/></button>
          </div>
          <Progress value={answered / presented.length * 100}/>
          {paletteFilter !== 'all' && <div className="cbt-palette-section-name">
            <span>Filtered by {statuses[paletteFilter as keyof typeof statuses].toLowerCase()}</span>
            <button onClick={() => setPaletteFilter('all')}>Clear filter<X size={12}/></button>
          </div>}
          <div className="cbt-palette-numbers">
            {paletteQuestions.map(item => {
              const number = presented.findIndex(question => question.id === item.id) + 1;
              const status = questionStatus(item, attempt.responses[item.id]);
              return <button key={item.id} className={`palette-question status-${status} ${question.id === item.id ? 'current' : ''}`} aria-label={`Question ${number}: ${statuses[status]}`} aria-current={question.id === item.id ? 'step' : undefined} disabled={locked} onClick={() => navigate(item.id)}>{number}</button>;
            })}
            {!paletteQuestions.length && <p>No questions in this filter.</p>}
          </div>
          <div className="cbt-palette-legend" aria-label="Filter questions by status">
            {Object.entries(statuses).map(([key, label]) => <button key={key} aria-pressed={paletteFilter === key} className={paletteFilter === key ? 'active' : ''} onClick={() => setPaletteFilter(paletteFilter === key ? 'all' : key)}>
              <i className={`status-${key}`} aria-hidden="true"/><span>{label}</span><b>{statusCount(key)}</b>
            </button>)}
          </div>
          <div className="cbt-palette-footer"><Keyboard size={15}/><p>Use Tab to move between controls. Arrow keys select single-choice options. Answers save automatically.</p></div>
        </div>
        <div className="cbt-palette-submit">
          <button className="cbt-submit-button" onClick={() => setConfirm(true)}>Submit test<Check size={15}/></button>
        </div>
      </aside>
    </div>
    {confirm&&<CbtSubmitConfirmation attempt={attempt} onClose={()=>setConfirm(false)} onSubmit={()=>onSubmit('manual')}/>}{instructions&&<Modal title="Test instructions" onClose={()=>setInstructions(false)}><div className="modal-body cbt-instructions"><Markdown>{attempt.paper.description||'Work through the questions at your own pace within the time limit.'}</Markdown><ul><li>The time limit is {attempt.paper.durationMinutes} minutes. The timer continues during reloads and interruptions.</li><li>Use the question palette or section tabs to navigate freely.</li><li>Your answers save immediately. The correct-answer marks and wrong-answer penalty appear on each question.</li><li>Multiple-correct questions use exact matching. Unanswered questions receive zero marks.</li><li>Marking a question for review keeps its current answer for scoring.</li><li>The paper submits when the timer ends. Manually submitting your final answers is irreversible.</li></ul><p>Session mode: <b>{policy.mode==='guarded'?'Guarded practice with browser integrity checks':'Practice'}</b>. Browser observations are not proof of misconduct. Answer keys and responses are stored locally and can be inspected on your device; this is not a high-stakes proctoring service.</p></div></Modal>}{overview&&<Modal title="Question paper overview" onClose={()=>setOverview(false)} wide><div className="cbt-paper-overview">{presented.map((q,number)=><article key={q.id}><div><b>Question {number+1}</b><span>{q.subject}</span><button disabled={locked} onClick={()=>{setSubject(null);navigate(q.id);setOverview(false);}}>Go to question<ArrowRight size={12}/></button></div><Markdown>{q.prompt}</Markdown></article>)}</div></Modal>}{leaving&&<Modal title="Return to the Test Centre?" onClose={()=>setLeaving(false)}><div className="modal-body"><p className="test-confirm-copy">Your responses are saved, and the timer will keep running. Resume this attempt before its deadline to continue answering.</p></div><footer className="modal-footer"><button className="button secondary" onClick={()=>setLeaving(false)}>Continue test</button><button className="button primary" onClick={leave}>Return to Test Centre<ArrowRight size={14}/></button></footer></Modal>}
  </div>;
  return expanded?createPortal(workspace,document.body):workspace;
}

export function TestCentre({ search = '' }: { search?: string }) {
  const { data: workspace, update: updateWorkspace, notify } = useStore();
  const { data, update, storageError } = useTestingStore();
  const [view, setView] = useState<View>(() => data.activeAttempt?.integrity?.policy.mode === 'guarded' ? 'exam' : 'library');
  const [tab, setTab] = useState<'papers' | 'history'>('papers');
  const [editor, setEditor] = useState<{ paper?: TestPaper } | null>(null);
  const [resources, setResources] = useState(false);
  const [cbtImport, setCbtImport] = useState(false);
  const [starting, setStarting] = useState<TestPaper | null>(null);
  const [remove, setRemove] = useState<TestPaper | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [importError, setImportError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const active = data.activeAttempt;
  const report = data.attempts.find(attempt => attempt.id === reportId);
  const papers = data.papers.filter(paper => `${paper.title} ${paper.questions.map(q => q.subject).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const attempts = data.attempts.filter(attempt => attempt.paper.title.toLowerCase().includes(search.toLowerCase()));
  const completedSeconds = Math.round(data.attempts.reduce((sum, attempt) => sum + Math.max(0, (attempt.submittedAt || attempt.startedAt) - attempt.startedAt) / 1000, 0));
  useLayoutEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [view]);
  useGSAP(() => { gsap.fromTo('.test-centre-toolbar,.test-summary>div', { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: duration(.28), stagger: .04, ease: 'expo.out', clearProps: 'transform,opacity' }); }, { scope: root, dependencies: [view], revertOnUpdate: true });
  useEffect(() => {
    const missing = data.attempts.filter(attempt => !workspace.assessments.some(assessment => assessment.id === `test-${attempt.id}` || assessment.id === attempt.id));
    if (!missing.length) return;
    updateWorkspace(state => {
      const pending = missing.filter(attempt => !state.assessments.some(assessment => assessment.id === `test-${attempt.id}` || assessment.id === attempt.id));
      if (!pending.length) return state;
      return { ...state, assessments: [...pending.map(attempt => {
      const result = analyseAttempt(attempt);
      const names = [...new Set(attempt.paper.questions.map(question => question.subject.trim().toLowerCase()))];
      const subject = names.length === 1 ? state.subjects.find(item => item.name.trim().toLowerCase() === names[0])?.id || '' : '';
      return { id: `test-${attempt.id}`, title: attempt.paper.title, subject, score: Math.round(result.score / result.maxScore * 100), date: new Date(attempt.submittedAt || attempt.startedAt).toISOString() };
    }), ...state.assessments] };
    });
  }, [data.attempts, workspace.assessments, workspace.subjects]);
  useEffect(() => {
    if (!active) return;
    const tick = () => update(state => {
      const current = state.activeAttempt;
      if (!current) return state;
      const now = Date.now();
      if (now >= current.deadlineAt) {
        const submitted = submitAttempt(current, current.deadlineAt, 'expired');
        return { ...state, activeAttempt: null, attempts: [submitted, ...state.attempts.filter(item => item.id !== submitted.id)] };
      }
      return { ...state, activeAttempt: tickAttempt(current, now) };
    });
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [active?.id, update]);
  useEffect(() => {
    if (view === 'exam' && !active) {
      const latest = data.attempts[0];
      if (latest) { setReportId(latest.id); setView('report'); }
      else setView('library');
    }
  }, [active, view, data.attempts]);
  function savePaper(paper: TestPaper) { const original = editor?.paper; update(state => ({ ...state, papers: [paper, ...state.papers.filter(item => item.id !== paper.id && item.id !== original?.id)] })); setEditor(null); setResources(false); setCbtImport(false); notify(original && original.id !== paper.id ? 'New paper version saved. Previous attempts keep their original analysis.' : 'Test paper saved'); }
  function start(paper: TestPaper) { if (active) { setView('exam'); notify('Resume or submit your current test before starting another.'); return; } setStarting(paper); }
  function submit(reason: 'manual' | 'integrity' = 'manual') {
    let finishedId = '';
    update(state => {
      const current = state.activeAttempt;
      if (!current) return state;
      const now = Date.now();
      const finished = submitAttempt(current, now, now >= current.deadlineAt ? 'expired' : reason);
      if (finished.status !== 'submitted') return state;
      finishedId = finished.id;
      return { ...state, activeAttempt: null, attempts: [finished, ...state.attempts.filter(item => item.id !== finished.id)] };
    });
    if (finishedId) { setReportId(finishedId); setView('report'); notify('Test submitted. Your analysis is ready.'); }
  }
  async function importPaper(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = input.files?.[0];
    if (!selected) return;
    try {
      if (selected.size > 15 * 1024 * 1024) throw new Error('Choose a JSON paper or backup under 15 MB.');
      const source = await selected.text();
      let raw: unknown;
      try { raw = JSON.parse(source); } catch { throw new Error('Choose a valid JSON paper or workspace backup.'); }
      if (raw && typeof raw === 'object' && 'papers' in raw) {
        const imported = validateTestingState(raw);
        const localSnapshots = [...data.papers, ...data.attempts.map(attempt => attempt.paper), ...(data.activeAttempt ? [data.activeAttempt.paper] : [])];
        const importedSnapshots = [...imported.papers, ...imported.attempts.map(attempt => attempt.paper), ...(imported.activeAttempt ? [imported.activeAttempt.paper] : [])];
        if (importedSnapshots.some(paper => localSnapshots.some(local => local.id === paper.id && paperComparisonKey(local) !== paperComparisonKey(paper)))) throw new Error('This backup contains a different paper version under an existing canonical ID. Edit or clone the conflicting paper to create a separate version before importing it.');
        update(state => {
          const papers = new Map(state.papers.map(paper => [paper.id, paper]));
          imported.papers.forEach(paper => { if (!papers.has(paper.id) || paper.updatedAt > papers.get(paper.id)!.updatedAt) papers.set(paper.id, paper); });
          return { ...state, papers: [...papers.values()], attempts: [...state.attempts, ...imported.attempts.filter(attempt => !state.attempts.some(item => item.id === attempt.id))].sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)), activeAttempt: state.activeAttempt || (state.attempts.some(attempt => attempt.id === imported.activeAttempt?.id) ? null : imported.activeAttempt), cohorts: { ...imported.cohorts, ...state.cohorts } };
        });
        setImportError(''); notify('Testing workspace imported. Existing attempts have been kept.');
        input.value = ''; return;
      }
      const imported = parsePaperJSON(source);
      const snapshots = [...data.papers, ...data.attempts.map(attempt => attempt.paper), ...(data.activeAttempt ? [data.activeAttempt.paper] : [])];
      if (snapshots.some(paper => paper.id === imported.id && paperComparisonKey(paper) !== paperComparisonKey(imported))) throw new Error('A different paper version already uses this canonical ID. Import a paper with its correct version ID, or edit your existing paper to create a separate version.');
      savePaper(imported); setImportError('');
    } catch (cause) { setImportError(cause instanceof Error ? cause.message : 'The paper could not be imported.'); }
    input.value = '';
  }
  if (view === 'exam' && active) return <><CbtExamWorkspace key={active.id} attempt={active} storageError={storageError} onChange={fn => update(state => { if (!state.activeAttempt) return state; const next = fn(state.activeAttempt); return next.status === 'submitted' ? { ...state, activeAttempt: null, attempts: [next, ...state.attempts.filter(item => item.id !== next.id)] } : { ...state, activeAttempt: next }; })} onSubmit={submit} onLibrary={() => setView('library')} /></>;
  if (view === 'report' && report) return <><TestAnalysis attempt={report} integritySummary={<IntegritySummary integrity={report.integrity} startedAt={report.startedAt} questionLabels={Object.fromEntries(getAttemptQuestions(report).map((question, index) => [question.id, `Question ${index + 1}`]))}/>} cohort={data.cohorts[paperComparisonKey(report.paper)] || []} onCohortChange={rows => update(state => ({ ...state, cohorts: { ...state.cohorts, [paperComparisonKey(report.paper)]: rows } }))} onBack={() => { setView('library'); setTab('history'); }} onRetake={() => { setView('library'); start(data.papers.find(paper => paper.id === report.paper.id) || report.paper); }} /></>;
  return <div className="test-centre" ref={root}>
    {storageError && <p className="test-error" role="alert">{storageError}</p>}
    {active && <div className="test-resume-banner"><StudyIllustration variant="focus" className="test-resume-art" size={118} /><div><span className="eyebrow">TEST IN PROGRESS</span><h3>{active.paper.title}</h3><p>{active.paper.questions.filter(q => responseHasAnswer(active.responses[q.id])).length} of {active.paper.questions.length} answered · {timeLabel(Math.ceil((active.deadlineAt - Date.now()) / 1000))} remaining</p></div><button className="button primary" onClick={() => setView('exam')}>Resume test<ArrowRight size={15} /></button></div>}
    <div className="test-summary"><div><span>My test papers</span><b>{data.papers.length}</b><small>Built from your questions</small></div><div><span>Tests submitted</span><b>{data.attempts.length}</b><small>Your completed practice</small></div><div><span>Questions answered</span><b>{data.attempts.reduce((sum, attempt) => sum + attempt.paper.questions.filter(q => responseHasAnswer(attempt.responses[q.id])).length, 0)}</b><small>Across all submitted attempts</small></div><div><span>Time in tests</span><b>{completedSeconds < 60 ? completedSeconds : (completedSeconds / 60).toLocaleString('en-IN', { maximumFractionDigits: 1 })}<em>{completedSeconds < 60 ? 'sec' : 'min'}</em></b><small>Actual elapsed test time</small></div></div>
    <div className="test-centre-toolbar"><div className="test-library-tabs" role="tablist" aria-label="Test centre views"><button role="tab" aria-selected={tab === 'papers'} className={tab === 'papers' ? 'active' : ''} onClick={() => setTab('papers')}><Layers3 size={15} />Test papers<span>{data.papers.length}</span></button><button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={15} />Result analysis<span>{data.attempts.length}</span></button></div><div className="test-toolbar-actions"><input ref={file} type="file" accept=".json,application/json" className="test-hidden-input" onChange={importPaper} /><button className="button secondary small" onClick={() => file.current?.click()}><Upload size={14} />Import JSON</button><button className="button secondary small cbt-import-button" onClick={() => setCbtImport(true)}><FileUp size={14}/>Import PDF / LaTeX / MathML</button><button className="button secondary small" onClick={() => setResources(true)}><Layers3 size={14} />From materials</button><button className="button primary small" onClick={() => setEditor({})}><Plus size={14} />Create paper</button></div></div>
    {importError && <div className="test-error" role="alert">{importError}<button className="icon-btn" aria-label="Dismiss import error" onClick={() => setImportError('')}><X size={14} /></button></div>}
    {tab === 'papers' ? papers.length ? <div className="test-paper-grid">{papers.map(paper => { const subjects = [...new Set(paper.questions.map(question => question.subject))]; const completed = data.attempts.filter(attempt => attempt.paper.id === paper.id); return <article className="test-card" key={paper.id}><div className="test-card-top"><StudyIllustration variant="test" className="test-paper-art" size={112} /><div className="test-card-actions"><button className="icon-btn" aria-label={`Clone ${paper.title}`} title="Clone paper as a separate test" onClick={() => { const now = Date.now(); const clone = { ...structuredClone(paper), id: uid(), title: `${paper.title} (copy)`, createdAt: now, updatedAt: now }; update(state => ({ ...state, papers: [clone, ...state.papers] })); notify('Paper cloned with a new canonical ID'); }}><Copy size={14}/></button><button className="icon-btn" aria-label={`Edit ${paper.title}`} onClick={() => setEditor({ paper })}><Pencil size={14} /></button><button className="icon-btn" aria-label={`Export ${paper.title}`} onClick={() => download(`${fileName(paper.title)}.json`, paper)}><Download size={14} /></button><button className="icon-btn" aria-label={`Delete ${paper.title}`} onClick={() => setRemove(paper)}><Trash2 size={14} /></button></div></div><h3>{paper.title}</h3><p className="test-card-description">{paper.description || 'A paper built for your own practice.'}</p><div className="test-card-facts"><span><Clock3 size={13} />{paper.durationMinutes} min</span><span>{paper.questions.length} questions</span><span>{paper.questions.reduce((sum, q) => sum + q.marks, 0)} marks</span></div><div className="test-subject-tags">{subjects.map(subject => <span key={subject}>{subject}</span>)}</div><footer><span>{completed.length ? `${completed.length} submitted ${completed.length === 1 ? 'attempt' : 'attempts'}` : 'Ready for your first attempt'}</span><button className="button secondary small" onClick={() => start(paper)}><Play size={13} />{completed.length ? 'Retake' : 'Start test'}</button></footer></article>; })}</div> : <div className="test-empty-wrap"><Empty illustration="test" title={search ? 'No matching papers' : 'Practice with a clear purpose'} description={search ? 'Try another paper title or subject.' : 'Create a timed paper, convert your PDF or LaTeX source, import JSON, or use questions from your materials. Verify every question and answer key before starting.'} action={!search && <button className="button primary" onClick={() => setEditor({})}><Plus size={15} />Create my first paper</button>} /><div className="test-empty-capabilities"><span><Clock3 size={15} />Timed exam workspace</span><span><Bookmark size={15} />Review & question palette</span><span><ShieldCheck size={15} />Detailed answer analysis</span></div></div> : attempts.length ? <div className="test-history"><div className="test-history-head"><span>Test paper</span><span>Submitted</span><span>Answered</span><span>Duration</span><span /></div>{attempts.map(attempt => <button className="test-history-row" key={attempt.id} onClick={() => { setReportId(attempt.id); setView('report'); }}><span><b>{attempt.paper.title}</b><small>{attempt.submissionReason === 'expired' ? 'Auto-submitted · time ended' : attempt.submissionReason === 'integrity' ? 'Auto-submitted · incident limit' : 'Submitted by you'}</small></span><span>{stamp(attempt.submittedAt || attempt.startedAt)}</span><span>{attempt.paper.questions.filter(q => responseHasAnswer(attempt.responses[q.id])).length}/{attempt.paper.questions.length}</span><span>{timeLabel(((attempt.submittedAt || attempt.startedAt) - attempt.startedAt) / 1000)}</span><span>View analysis<ChevronRight size={15} /></span></button>)}</div> : <Empty illustration="analytics" title="Your progress starts with a test" description="Submitted tests appear here with your answers, time analysis, question journey, and solutions." action={<button className="button secondary" onClick={() => setTab('papers')}>Browse my papers<ArrowRight size={15} /></button>} />}
    <div className="test-backup-row"><span><ShieldCheck size={14}/>Your test papers and attempts stay in this browser.</span><button className="text-link" onClick={() => download(`verdant-tests-${new Date().toISOString().slice(0, 10)}.json`, data)}><Download size={13}/>Export test workspace</button></div><details className="test-import-help"><summary><FileJson size={15} />How to import a paper<ChevronDown size={14} /></summary><p>Create and export a paper to get the JSON format. Importing validates question types, options, answer keys, marks, and duration before saving. Workspace exports include papers, submitted attempts, the running attempt, and imported comparison records. Import JSON also restores these exports by merging with the current workspace. Paper and question IDs are preserved so result exports match the same shared paper. Imports with a conflicting canonical ID are rejected. Editing question content creates a separate paper version; use Clone to make an independent copy. Imported questions can be edited before you start. Import PDF / LaTeX / MathML extracts supplied question drafts locally; MathML equation snippets remain editable source until you add a real numbered question and choices. The importer opens mandatory question and key review. Scanned pages need text or a text-based source; missing or ambiguous keys must be supplied before saving. Verify every answer key and diagram before starting.</p><p>Answers and solutions are stored locally for personal practice. This workspace does not require AI to run, score, or analyse your tests.</p></details>
    {editor && <PaperEditor paper={editor.paper} onClose={() => setEditor(null)} onSave={savePaper} />}
    {resources && <ResourceImport onClose={() => setResources(false)} onImport={savePaper} />}
    {cbtImport && <CbtImport onClose={() => setCbtImport(false)} onSave={savePaper}/> }
    {starting && <CbtStartPaper paper={starting} onClose={() => setStarting(null)} onStart={options => { const attempt = createAttempt(starting, Date.now(), options); update(state => ({ ...state, activeAttempt: attempt })); setStarting(null); setView('exam'); }} />}
    {remove && <Modal title="Delete this test paper?" onClose={() => setRemove(null)}><div className="modal-body"><p className="test-confirm-copy">“{remove.title}” will leave your paper library. Submitted attempts keep their original questions and answer keys.</p></div><footer className="modal-footer"><button className="button secondary" onClick={() => setRemove(null)}>Keep paper</button><button className="button danger" onClick={() => { const removed = remove; update(state => ({ ...state, papers: state.papers.filter(paper => paper.id !== removed.id) })); setRemove(null); notify('Test paper deleted', () => update(state => ({ ...state, papers: [removed, ...state.papers] }))); }}><Trash2 size={15} />Delete paper</button></footer></Modal>}
  </div>;
}

export default TestCentre;
