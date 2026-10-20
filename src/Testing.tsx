import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3, Copy, Download, FileJson, Flag, History, Layers3, Pencil, Play, Plus, Save, Search, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { uid } from './model';
import type { Resource } from './model';
import { useStore } from './store';
import { Empty, Markdown, Modal, Progress, TimerDigits, duration, gsap, useGSAP } from './ui';
import { analyseAttempt, answerQuestion, clearAnswer, createAttempt, parsePaperJSON, questionStatus, submitAttempt, tickAttempt, toggleReview, validatePaper, visitQuestion } from './testing-model';
import type { TestAttempt, TestPaper, TestQuestion, TestResponse } from './testing-model';
import { paperComparisonKey, useTestingStore, validateTestingState } from './testing-store';
import { TestAnalysis } from './TestAnalysis';
import './testing.css';

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
  const [title, setTitle] = useState(paper?.title || '');
  const [description, setDescription] = useState(paper?.description || '');
  const [minutes, setMinutes] = useState(paper?.durationMinutes || 60);
  const [questions, setQuestions] = useState<TestQuestion[]>(paper ? structuredClone(paper.questions) : [blankQuestion()]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const question = questions[active];
  function change(patch: Partial<TestQuestion>) { setQuestions(items => items.map((item, index) => index === active ? { ...item, ...patch } : item)); setError(''); }
  function save() {
    try {
      const now = Date.now();
      let next = validatePaper({ id: paper?.id || uid(), title: title.trim(), description: description.trim(), durationMinutes: minutes, questions, createdAt: paper?.createdAt || now, updatedAt: now });
      if (paper && paperComparisonKey(next) !== paperComparisonKey(paper)) next = { ...next, id: uid(), createdAt: now };
      onSave(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the paper and try again.'); }
  }
  function addQuestion() { setQuestions(items => [...items, blankQuestion()]); setActive(questions.length); }
  return <Modal title={paper ? 'Edit test paper' : 'Create a test paper'} onClose={onClose} wide>
    <div className="test-editor">
      <div className="test-editor-details">
        <label>Paper title<input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder="Name your test" required /></label>
        <label>Instructions<textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Syllabus, permitted tools, or other instructions" /></label>
        <label>Duration in minutes<input type="number" min={1} max={1440} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label>
      </div>
      <div className="test-editor-workspace">
        <aside className="test-editor-index"><span className="eyebrow">YOUR QUESTIONS</span>{questions.map((q, index) => <button key={q.id} className={active === index ? 'active' : ''} onClick={() => { setActive(index); setPreview(false); }}><span>{index + 1}</span><b>{q.prompt.trim() || 'Untitled question'}</b>{q.prompt.trim() && <Check size={12} />}</button>)}<button className="test-add-question" onClick={addQuestion}><Plus size={14} />Add question</button></aside>
        <section className="test-question-editor question-editor" key={question.id}>
          <div className="test-question-editor-title"><h3>Question {active + 1}</h3><div><button className="button secondary small" onClick={() => setPreview(!preview)}>{preview ? 'Edit question' : 'Preview'}</button><button className="icon-btn" aria-label="Duplicate question" title="Duplicate question" onClick={() => { const copy = { ...structuredClone(question), id: uid() }; setQuestions(items => [...items, copy]); setActive(questions.length); }}><Copy size={15} /></button><button className="icon-btn" aria-label="Delete question" disabled={questions.length === 1} onClick={() => { setQuestions(items => items.filter((_, i) => i !== active)); setActive(Math.max(0, active - 1)); }}><Trash2 size={15} /></button></div></div>
          {preview ? <div className="test-question-preview"><Markdown>{question.prompt || 'Write the question to see its preview.'}</Markdown>{question.kind === 'numeric' ? <p>Numerical answer: <b>{question.numericAnswer ?? 'Not set'}</b> · tolerance ±{question.tolerance || 0}</p> : question.options.map((option, index) => <div className={`test-preview-option ${question.correctAnswers.includes(index) ? 'correct' : ''}`} key={index}><b>{String.fromCharCode(65 + index)}</b><Markdown>{option || 'Empty option'}</Markdown>{question.correctAnswers.includes(index) && <Check size={15} />}</div>)}{question.explanation && <div className="test-answer-explanation"><Markdown>{question.explanation}</Markdown></div>}</div> : <>
            <div className="test-form-grid"><label>Answer type<select value={question.kind} onChange={e => { const kind = e.target.value as TestQuestion['kind']; change({ kind, correctAnswers: kind === 'single' ? [question.correctAnswers[0] ?? 0] : question.correctAnswers, numericAnswer: kind === 'numeric' ? question.numericAnswer ?? 0 : undefined }); }}><option value="single">Single correct option</option><option value="multiple">Multiple correct options</option><option value="numeric">Numerical answer</option></select></label><label>Subject<input required value={question.subject} onChange={e => change({ subject: e.target.value })} placeholder="Subject name" /></label><label>Chapter<input value={question.chapter} onChange={e => change({ chapter: e.target.value })} placeholder="Chapter name" /></label><label>Topic<input value={question.topic} onChange={e => change({ topic: e.target.value })} placeholder="Topic name" /></label></div>
            <label>Question · Markdown & LaTeX supported<textarea rows={5} value={question.prompt} onChange={e => change({ prompt: e.target.value })} placeholder="Write the full question. Use $...$ for inline maths." /></label>
            {question.kind === 'numeric' ? <div className="test-form-grid"><label>Correct numerical answer<input type="number" step="any" value={question.numericAnswer ?? ''} onChange={e => change({ numericAnswer: e.target.value === '' ? undefined : Number(e.target.value) })} /></label><label>Accepted tolerance (±)<input type="number" min={0} step="any" value={question.tolerance || 0} onChange={e => change({ tolerance: Number(e.target.value) })} /></label></div> : <fieldset className="test-option-editor"><legend>{question.kind === 'single' ? 'Select the correct option' : 'Select every correct option'}</legend>{question.options.map((option, index) => <div key={index}><input aria-label={`Option ${String.fromCharCode(65 + index)} is correct`} type={question.kind === 'single' ? 'radio' : 'checkbox'} name={`correct-${question.id}`} checked={question.correctAnswers.includes(index)} onChange={() => change({ correctAnswers: question.kind === 'single' ? [index] : question.correctAnswers.includes(index) ? question.correctAnswers.filter(i => i !== index) : [...question.correctAnswers, index].sort() })} /><span>{String.fromCharCode(65 + index)}</span><textarea aria-label={`Option ${String.fromCharCode(65 + index)}`} rows={1} value={option} onChange={e => change({ options: question.options.map((value, i) => i === index ? e.target.value : value) })} /><button className="icon-btn" aria-label={`Delete option ${String.fromCharCode(65 + index)}`} disabled={question.options.length <= 2} onClick={() => change({ options: question.options.filter((_, i) => i !== index), correctAnswers: question.correctAnswers.filter(i => i !== index).map(i => i > index ? i - 1 : i) })}><X size={14} /></button></div>)}<button className="text-link" disabled={question.options.length >= 8} onClick={() => change({ options: [...question.options, ''] })}><Plus size={13} />Add option</button></fieldset>}
            <div className="test-form-grid test-scoring-grid"><label>Correct marks<input type="number" min={0.01} max={1000} step="any" value={question.marks} onChange={e => change({ marks: Number(e.target.value) })} /></label><label>Penalty for wrong answer<input type="number" min={0} max={1000} step="any" value={question.negativeMarks} onChange={e => change({ negativeMarks: Number(e.target.value) })} /></label><label>Difficulty<select value={question.difficulty} onChange={e => change({ difficulty: e.target.value as TestQuestion['difficulty'] })}><option>Easy</option><option>Moderate</option><option>Tough</option></select></label><label>Ideal seconds<input type="number" min={1} max={86400} value={question.idealSeconds} onChange={e => change({ idealSeconds: Number(e.target.value) })} /></label></div>
            <p className="test-field-hint">Multiple correct questions use exact matching. The wrong-answer penalty applies when any selected option differs from the answer key. Unanswered questions receive zero.</p>
            <label>Solution and explanation<textarea rows={4} value={question.explanation} onChange={e => change({ explanation: e.target.value })} placeholder="Explain the method so you can review it after submission." /></label>
          </>}
        </section>
      </div>
      {error && <p className="test-error" role="alert">{error}</p>}
    </div>
    <footer className="modal-footer"><span className="test-footer-count">{questions.length} questions · {questions.reduce((sum, q) => sum + q.marks, 0)} marks</span><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" onClick={save}><Save size={15} />Save paper</button></footer>
  </Modal>;
}

function ResourceImport({ onClose, onImport }: { onClose: () => void; onImport: (paper: TestPaper) => void }) {
  const { data } = useStore();
  const resources = data.resources.filter(resource => !!resource.questions?.length);
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [error, setError] = useState('');
  function importQuestions() {
    try {
      const selected = resources.filter(resource => chosen.includes(resource.id));
      if (!selected.length) throw new Error('Select at least one material with practice questions.');
      const now = Date.now();
      const questions = selected.flatMap((resource: Resource) => resource.questions!.map(question => ({ ...blankQuestion(), prompt: question.prompt, subject: data.subjects.find(subject => subject.id === resource.subject)?.name || 'General', topic: resource.title, options: question.options, correctAnswers: [question.answer], explanation: question.explanation })));
      onImport(validatePaper({ id: uid(), title: title.trim() || selected.map(resource => resource.title).join(' + '), description: 'Practice questions from your Resource Vault.', durationMinutes: minutes, questions, createdAt: now, updatedAt: now }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The selected questions could not be imported.'); }
  }
  return <Modal title="Use questions from your materials" onClose={onClose}><div className="modal-body"><p className="test-field-hint">Create a timed paper from practice questions you have already written in the Resource Vault.</p>{!resources.length ? <Empty title="Add your questions first" description="Edit a resource and add practice questions. They will appear here when they have an answer key." /> : <><label>Paper title<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Optional · defaults to material titles" /></label><label className="test-label-gap">Duration in minutes<input type="number" min={1} max={1440} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label><div className="test-resource-choices">{resources.map(resource => <label key={resource.id}><input type="checkbox" checked={chosen.includes(resource.id)} onChange={() => setChosen(items => items.includes(resource.id) ? items.filter(id => id !== resource.id) : [...items, resource.id])} /><span><b>{resource.title}</b><small>{resource.questions!.length} questions · {data.subjects.find(subject => subject.id === resource.subject)?.name || 'General'}</small></span></label>)}</div></>}{error && <p className="test-error" role="alert">{error}</p>}</div><footer className="modal-footer"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!chosen.length} onClick={importQuestions}>Create paper<ArrowRight size={15} /></button></footer></Modal>;
}

function StartPaper({ paper, onClose, onStart }: { paper: TestPaper; onClose: () => void; onStart: () => void }) {
  const subjects = [...new Set(paper.questions.map(question => question.subject))];
  return <Modal title="Ready when you are" onClose={onClose}><div className="modal-body test-start"><span className="test-paper-badge"><ShieldCheck size={17} />TIMED PRACTICE</span><h2>{paper.title}</h2><div className="test-start-facts"><span><Clock3 size={16} /><b>{paper.durationMinutes}</b>minutes</span><span><Layers3 size={16} /><b>{paper.questions.length}</b>questions</span><span><Flag size={16} /><b>{paper.questions.reduce((sum, q) => sum + q.marks, 0)}</b>marks</span></div>{paper.description && <Markdown>{paper.description}</Markdown>}<ul><li>The timer continues if you leave this view. Your answers save automatically on this browser.</li><li>Use the question palette to move freely, and mark questions for review.</li><li>Wrong answers use the penalty shown on each question. Multiple correct answers require all correct options.</li><li>The paper submits automatically when the timer reaches zero. Answers and solutions appear after submission.</li></ul><div className="test-subject-tags">{subjects.map(subject => <span key={subject}>{subject}</span>)}</div></div><footer className="modal-footer"><button className="button secondary" onClick={onClose}>Go back</button><button className="button primary" onClick={onStart}><Play size={15} />Begin test</button></footer></Modal>;
}

function SubmitConfirmation({ attempt, onClose, onSubmit }: { attempt: TestAttempt; onClose: () => void; onSubmit: () => void }) {
  const count = (predicate: (response: TestResponse | undefined, question: TestQuestion) => boolean) => attempt.paper.questions.filter(question => predicate(attempt.responses[question.id], question)).length;
  const answered = count(response => responseHasAnswer(response));
  const marked = count(response => !!response?.markedReview);
  return <Modal title="Submit this test?" onClose={onClose}><div className="modal-body"><p className="test-confirm-copy">Your responses will be final. You can review every answer and the time you spent after submitting.</p><div className="test-submit-stats"><div><b>{answered}</b><span>Answered</span></div><div><b>{attempt.paper.questions.length - answered}</b><span>Unanswered</span></div><div><b>{marked}</b><span>Marked for review</span></div></div><p className="test-field-hint">Marked questions are scored using their saved answer. Unanswered questions receive zero marks.</p></div><footer className="modal-footer"><button className="button secondary" onClick={onClose}>Continue test</button><button className="button primary" onClick={onSubmit}><CheckCircle2 size={15} />Submit final answers</button></footer></Modal>;
}

function ExamWorkspace({ attempt, onChange, onSubmit, onLibrary }: { attempt: TestAttempt; onChange: (fn: (attempt: TestAttempt) => TestAttempt) => void; onSubmit: () => void; onLibrary: () => void }) {
  const [subject, setSubject] = useState('all');
  const [palette, setPalette] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const subjects = [...new Set(attempt.paper.questions.map(q => q.subject))];
  const filtered = attempt.paper.questions.filter(q => subject === 'all' || q.subject === subject);
  const question = attempt.paper.questions.find(q => q.id === attempt.currentQuestionId) || attempt.paper.questions[0];
  const index = attempt.paper.questions.findIndex(q => q.id === question.id);
  const filteredIndex = filtered.findIndex(q => q.id === question.id);
  const response = attempt.responses[question.id];
  const [numericDraft, setNumericDraft] = useState(typeof response?.value === 'string' ? response.value : '');
  useEffect(() => { setNumericDraft(typeof response?.value === 'string' ? response.value : ''); }, [question.id]);
  const seconds = Math.ceil(Math.max(0, attempt.deadlineAt - Date.now()) / 1000);
  const answered = attempt.paper.questions.filter(q => responseHasAnswer(attempt.responses[q.id])).length;
  const selected = Array.isArray(response?.value) ? response.value : [];
  useGSAP(() => { gsap.fromTo('.exam-question-content', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: duration(.24), ease: 'expo.out', clearProps: 'transform,opacity' }); }, { scope: panel, dependencies: [question.id], revertOnUpdate: true });
  const navigate = (id: string) => { onChange(current => visitQuestion(current, id, Date.now())); setPalette(false); };
  function next() { if (filteredIndex < filtered.length - 1) navigate(filtered[filteredIndex + 1].id); else setConfirm(true); }
  function choose(option: number) {
    const value = question.kind === 'single' ? [option] : selected.includes(option) ? selected.filter(index => index !== option) : [...selected, option].sort();
    onChange(current => answerQuestion(current, question.id, value, Date.now()));
  }
  const statusLabels = { unvisited: 'Not visited', unanswered: 'Not answered', answered: 'Answered', review: 'Marked for review', 'answered-review': 'Answered & marked' };
  return <div className="exam-workspace" ref={panel}>
    <div className="exam-topbar"><button className="test-back-link" onClick={onLibrary}><ArrowLeft size={15} /><span>Test centre</span></button><div className="exam-paper-name"><b>{attempt.paper.title}</b><span>Saved automatically · timer keeps running</span></div><div className={`exam-clock ${seconds < 300 ? 'urgent' : ''}`} role="timer" aria-label={`${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`}><Clock3 size={17} /><b><TimerDigits value={timeLabel(seconds)}/></b><span>remaining</span></div><button className="button primary small" onClick={() => setConfirm(true)}>Submit test<Check size={15} /></button></div>
    <div className="exam-subjects"><button className={subject === 'all' ? 'active' : ''} onClick={() => setSubject('all')}>All subjects</button>{subjects.map(name => <button key={name} className={subject === name ? 'active' : ''} onClick={() => { setSubject(name); const first = attempt.paper.questions.find(q => q.subject === name); if (first && question.subject !== name) navigate(first.id); }}>{name}</button>)}<button className="exam-palette-toggle" onClick={() => setPalette(!palette)}><Layers3 size={14} />Question palette<ChevronDown size={13} /></button></div>
    <div className="exam-body"><main className="exam-question-panel"><div className="exam-question-meta"><span>Question {index + 1} <small>of {attempt.paper.questions.length}</small></span><div><span>{question.kind === 'single' ? 'Single correct' : question.kind === 'multiple' ? 'Multiple correct' : 'Numerical'}</span><b className="marks-positive">+{question.marks}</b><b className="marks-negative">−{question.negativeMarks}</b></div></div><div className="exam-question-content"><div className="exam-question-prompt"><Markdown>{question.prompt}</Markdown></div>{question.kind === 'numeric' ? <div className="exam-numeric"><label htmlFor="numerical-response">Your numerical answer</label><input id="numerical-response" inputMode="decimal" type="text" autoComplete="off" maxLength={100} value={numericDraft} onChange={e => { const value = e.target.value; if (!/^[+\-\d.eE]*$/.test(value)) return; setNumericDraft(value); const valid = value === '' || /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value)); onChange(current => answerQuestion(current, question.id, valid ? value : '', Date.now())); }} placeholder="Enter a number" /><p>{numericDraft && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(numericDraft) || !Number.isFinite(Number(numericDraft))) ? 'Finish entering a valid number to save this answer.' : 'Use a decimal point for decimal answers. Your entry saves as you type.'}</p></div> : <div className="exam-options" role={question.kind === 'single' ? 'radiogroup' : 'group'} aria-label="Answer options">{question.options.map((option, optionIndex) => <button key={optionIndex} role={question.kind === 'single' ? 'radio' : 'checkbox'} aria-checked={selected.includes(optionIndex)} tabIndex={question.kind === 'single' ? selected.includes(optionIndex) || !selected.length && optionIndex === 0 ? 0 : -1 : 0} onKeyDown={e => { if (question.kind !== 'single' || !['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); const nextIndex = e.key === 'Home' ? 0 : e.key === 'End' ? question.options.length - 1 : (optionIndex + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + question.options.length) % question.options.length; choose(nextIndex); (e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('.exam-option')[nextIndex])?.focus(); }} className={`exam-option ${selected.includes(optionIndex) ? 'selected' : ''}`} onClick={() => choose(optionIndex)}><span className={`exam-option-letter ${question.kind === 'multiple' ? 'square' : ''}`}>{selected.includes(optionIndex) ? <Check size={15} /> : String.fromCharCode(65 + optionIndex)}</span><Markdown>{option}</Markdown></button>)}</div>}</div><div className="exam-question-footer"><button className={`button secondary ${response?.markedReview ? 'is-marked' : ''}`} aria-pressed={!!response?.markedReview} onClick={() => onChange(current => toggleReview(current, question.id, Date.now()))}><Bookmark size={15} fill={response?.markedReview ? 'currentColor' : 'none'} />{response?.markedReview ? 'Marked for review' : 'Mark for review'}</button><button className="button secondary" disabled={!responseHasAnswer(response) && !(question.kind === 'numeric' && numericDraft.trim())} onClick={() => { setNumericDraft(''); onChange(current => clearAnswer(current, question.id, Date.now())); }}>Clear answer</button><span className="exam-saved"><ShieldCheck size={13} />Saved</span><div className="exam-navigation"><button className="button secondary" disabled={filteredIndex <= 0} onClick={() => navigate(filtered[filteredIndex - 1].id)}><ArrowLeft size={15} />Previous</button><button className="button primary" onClick={next}>{filteredIndex === filtered.length - 1 ? 'Review & submit' : 'Save & next'}<ArrowRight size={15} /></button></div></div></main><aside className={`exam-palette ${palette ? 'open' : ''}`}><div className="exam-palette-heading"><span className="eyebrow">QUESTION PALETTE</span><b>{answered}/{attempt.paper.questions.length}</b></div><Progress value={answered / attempt.paper.questions.length * 100} /><div className="exam-palette-grid">{filtered.map(q => { const number = attempt.paper.questions.findIndex(item => item.id === q.id) + 1; const status = questionStatus(q, attempt.responses[q.id]); return <button key={q.id} className={`palette-question status-${status} ${question.id === q.id ? 'current' : ''}`} aria-label={`Question ${number}: ${statusLabels[status]}`} aria-current={question.id === q.id ? 'step' : undefined} onClick={() => navigate(q.id)}>{number}</button>; })}</div><div className="exam-status-legend">{Object.entries(statusLabels).map(([key, label]) => <span key={key}><i className={`status-${key}`} />{label}<b>{attempt.paper.questions.filter(q => questionStatus(q, attempt.responses[q.id]) === key).length}</b></span>)}</div><div className="exam-palette-note"><ShieldCheck size={17} /><p>Every answer stays on this browser. Return before the timer ends to continue.</p></div></aside></div>{confirm && <SubmitConfirmation attempt={attempt} onClose={() => setConfirm(false)} onSubmit={onSubmit} />}
  </div>;
}

export function TestCentre({ search = '' }: { search?: string }) {
  const { data: workspace, update: updateWorkspace, notify } = useStore();
  const { data, update, storageError } = useTestingStore();
  const [view, setView] = useState<View>('library');
  const [tab, setTab] = useState<'papers' | 'history'>('papers');
  const [editor, setEditor] = useState<{ paper?: TestPaper } | null>(null);
  const [resources, setResources] = useState(false);
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
  function savePaper(paper: TestPaper) { const original = editor?.paper; update(state => ({ ...state, papers: [paper, ...state.papers.filter(item => item.id !== paper.id && item.id !== original?.id)] })); setEditor(null); setResources(false); notify(original && original.id !== paper.id ? 'New paper version saved. Previous attempts keep their original analysis.' : 'Test paper saved'); }
  function start(paper: TestPaper) { if (active) { setView('exam'); notify('Resume or submit your current test before starting another.'); return; } setStarting(paper); }
  function submit() {
    if (!active) return;
    const finished = submitAttempt(active, Date.now(), Date.now() >= active.deadlineAt ? 'expired' : 'manual');
    update(state => ({ ...state, activeAttempt: null, attempts: [finished, ...state.attempts.filter(item => item.id !== finished.id)] })); setReportId(finished.id); setView('report'); notify('Test submitted. Your analysis is ready.');
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
  if (view === 'exam' && active) return <><ExamWorkspace attempt={active} onChange={fn => update(state => { if (!state.activeAttempt) return state; const next = fn(state.activeAttempt); return next.status === 'submitted' ? { ...state, activeAttempt: null, attempts: [next, ...state.attempts.filter(item => item.id !== next.id)] } : { ...state, activeAttempt: next }; })} onSubmit={submit} onLibrary={() => setView('library')} />{storageError && <p className="test-error" role="alert">{storageError}</p>}</>;
  if (view === 'report' && report) return <TestAnalysis attempt={report} cohort={data.cohorts[paperComparisonKey(report.paper)] || []} onCohortChange={rows => update(state => ({ ...state, cohorts: { ...state.cohorts, [paperComparisonKey(report.paper)]: rows } }))} onBack={() => { setView('library'); setTab('history'); }} onRetake={() => { setView('library'); start(data.papers.find(paper => paper.id === report.paper.id) || report.paper); }} />;
  return <div className="test-centre" ref={root}>
    {storageError && <p className="test-error" role="alert">{storageError}</p>}
    {active && <div className="test-resume-banner"><div className="test-resume-icon"><Clock3 size={23} /></div><div><span className="eyebrow">TEST IN PROGRESS</span><h3>{active.paper.title}</h3><p>{active.paper.questions.filter(q => responseHasAnswer(active.responses[q.id])).length} of {active.paper.questions.length} answered · {timeLabel(Math.ceil((active.deadlineAt - Date.now()) / 1000))} remaining</p></div><button className="button primary" onClick={() => setView('exam')}>Resume test<ArrowRight size={15} /></button></div>}
    <div className="test-summary"><div><span>My test papers</span><b>{data.papers.length}</b><small>Built from your questions</small></div><div><span>Tests submitted</span><b>{data.attempts.length}</b><small>Your completed practice</small></div><div><span>Questions answered</span><b>{data.attempts.reduce((sum, attempt) => sum + attempt.paper.questions.filter(q => responseHasAnswer(attempt.responses[q.id])).length, 0)}</b><small>Across all submitted attempts</small></div><div><span>Time in tests</span><b>{completedSeconds < 60 ? completedSeconds : (completedSeconds / 60).toLocaleString('en-IN', { maximumFractionDigits: 1 })}<em>{completedSeconds < 60 ? 'sec' : 'min'}</em></b><small>Actual elapsed test time</small></div></div>
    <div className="test-centre-toolbar"><div className="test-library-tabs" role="tablist" aria-label="Test centre views"><button role="tab" aria-selected={tab === 'papers'} className={tab === 'papers' ? 'active' : ''} onClick={() => setTab('papers')}><Layers3 size={15} />Test papers<span>{data.papers.length}</span></button><button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={15} />Attempt history<span>{data.attempts.length}</span></button></div><div className="test-toolbar-actions"><input ref={file} type="file" accept=".json,application/json" className="test-hidden-input" onChange={importPaper} /><button className="button secondary small" onClick={() => file.current?.click()}><Upload size={14} />Import JSON</button><button className="button secondary small" onClick={() => setResources(true)}><Layers3 size={14} />From materials</button><button className="button primary small" onClick={() => setEditor({})}><Plus size={14} />Create paper</button></div></div>
    {importError && <div className="test-error" role="alert">{importError}<button className="icon-btn" aria-label="Dismiss import error" onClick={() => setImportError('')}><X size={14} /></button></div>}
    {tab === 'papers' ? papers.length ? <div className="test-paper-grid">{papers.map(paper => { const subjects = [...new Set(paper.questions.map(question => question.subject))]; const completed = data.attempts.filter(attempt => attempt.paper.id === paper.id); return <article className="test-card" key={paper.id}><div className="test-card-top"><span className="test-card-icon"><FileJson size={21} /></span><div className="test-card-actions"><button className="icon-btn" aria-label={`Clone ${paper.title}`} title="Clone paper as a separate test" onClick={() => { const now = Date.now(); const clone = { ...structuredClone(paper), id: uid(), title: `${paper.title} (copy)`, createdAt: now, updatedAt: now }; update(state => ({ ...state, papers: [clone, ...state.papers] })); notify('Paper cloned with a new canonical ID'); }}><Copy size={14}/></button><button className="icon-btn" aria-label={`Edit ${paper.title}`} onClick={() => setEditor({ paper })}><Pencil size={14} /></button><button className="icon-btn" aria-label={`Export ${paper.title}`} onClick={() => download(`${fileName(paper.title)}.json`, paper)}><Download size={14} /></button><button className="icon-btn" aria-label={`Delete ${paper.title}`} onClick={() => setRemove(paper)}><Trash2 size={14} /></button></div></div><h3>{paper.title}</h3><p className="test-card-description">{paper.description || 'A paper built for your own practice.'}</p><div className="test-card-facts"><span><Clock3 size={13} />{paper.durationMinutes} min</span><span>{paper.questions.length} questions</span><span>{paper.questions.reduce((sum, q) => sum + q.marks, 0)} marks</span></div><div className="test-subject-tags">{subjects.map(subject => <span key={subject}>{subject}</span>)}</div><footer><span>{completed.length ? `${completed.length} submitted ${completed.length === 1 ? 'attempt' : 'attempts'}` : 'Ready for your first attempt'}</span><button className="button secondary small" onClick={() => start(paper)}><Play size={13} />{completed.length ? 'Retake' : 'Start test'}</button></footer></article>; })}</div> : <div className="test-empty-wrap"><Empty title={search ? 'No matching papers' : 'Practice with a clear purpose'} description={search ? 'Try another paper title or subject.' : 'Create your own timed paper, import a real question paper in JSON, or use practice questions from your materials. Every test starts with your content.'} action={!search && <button className="button primary" onClick={() => setEditor({})}><Plus size={15} />Create my first paper</button>} /><div className="test-empty-capabilities"><span><Clock3 size={15} />Timed exam workspace</span><span><Bookmark size={15} />Review & question palette</span><span><ShieldCheck size={15} />Detailed answer analysis</span></div></div> : attempts.length ? <div className="test-history"><div className="test-history-head"><span>Test paper</span><span>Submitted</span><span>Answered</span><span>Duration</span><span /></div>{attempts.map(attempt => <button className="test-history-row" key={attempt.id} onClick={() => { setReportId(attempt.id); setView('report'); }}><span><b>{attempt.paper.title}</b><small>{attempt.submissionReason === 'expired' ? 'Auto-submitted · time ended' : 'Submitted by you'}</small></span><span>{stamp(attempt.submittedAt || attempt.startedAt)}</span><span>{attempt.paper.questions.filter(q => responseHasAnswer(attempt.responses[q.id])).length}/{attempt.paper.questions.length}</span><span>{timeLabel(((attempt.submittedAt || attempt.startedAt) - attempt.startedAt) / 1000)}</span><span>View analysis<ChevronRight size={15} /></span></button>)}</div> : <Empty title="Your progress starts with a test" description="Submitted tests appear here with your answers, time analysis, question journey, and solutions." action={<button className="button secondary" onClick={() => setTab('papers')}>Browse my papers<ArrowRight size={15} /></button>} />}
    <div className="test-backup-row"><span><ShieldCheck size={14}/>Your test papers and attempts stay in this browser.</span><button className="text-link" onClick={() => download(`verdant-tests-${new Date().toISOString().slice(0, 10)}.json`, data)}><Download size={13}/>Export test workspace</button></div><details className="test-import-help"><summary><FileJson size={15} />How to import a paper<ChevronDown size={14} /></summary><p>Create and export a paper to get the JSON format. Importing validates question types, options, answer keys, marks, and duration before saving. Workspace exports include papers, submitted attempts, the running attempt, and imported comparison records. Import JSON also restores these exports by merging with the current workspace. Paper and question IDs are preserved so result exports match the same shared paper. Imports with a conflicting canonical ID are rejected. Editing question content creates a separate paper version; use Clone to make an independent copy. Imported questions can be edited before you start. PDFs and Word files stay in the Resource Vault; questions must have a verified answer key to score a test.</p><p>Answers and solutions are stored locally for personal practice. This workspace does not require AI to run, score, or analyse your tests.</p></details>
    {editor && <PaperEditor paper={editor.paper} onClose={() => setEditor(null)} onSave={savePaper} />}
    {resources && <ResourceImport onClose={() => setResources(false)} onImport={savePaper} />}
    {starting && <StartPaper paper={starting} onClose={() => setStarting(null)} onStart={() => { const attempt = createAttempt(starting, Date.now()); update(state => ({ ...state, activeAttempt: attempt })); setStarting(null); setView('exam'); }} />}
    {remove && <Modal title="Delete this test paper?" onClose={() => setRemove(null)}><div className="modal-body"><p className="test-confirm-copy">“{remove.title}” will leave your paper library. Submitted attempts keep their original questions and answer keys.</p></div><footer className="modal-footer"><button className="button secondary" onClick={() => setRemove(null)}>Keep paper</button><button className="button danger" onClick={() => { const removed = remove; update(state => ({ ...state, papers: state.papers.filter(paper => paper.id !== removed.id) })); setRemove(null); notify('Test paper deleted', () => update(state => ({ ...state, papers: [removed, ...state.papers] }))); }}><Trash2 size={15} />Delete paper</button></footer></Modal>}
  </div>;
}

export default TestCentre;
