import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, FileText, LoaderCircle, Plus, Trash2, Upload } from 'lucide-react';
import { extractMaterial, MAX_FILE_SIZE } from './materials';
import { getCbtQuestionIssues, parseCbtLatex, parseCbtText } from './cbt-import';
import type { CbtDraftQuestion, CbtImportDefaults } from './cbt-import';
import { validatePaper } from './testing-model';
import type { TestPaper, TestQuestion } from './testing-model';
import { Markdown, Modal, duration, gsap, useGSAP } from './ui';
import './cbt-import.css';

export function CbtImport({ onClose, onSave }: { onClose: () => void; onSave: (paper: TestPaper) => void }) {
  const [step, setStep] = useState<'source' | 'review'>('source'), [format, setFormat] = useState<'text' | 'latex'>('text');
  const [source, setSource] = useState(''), [sourceName, setSourceName] = useState(''), [title, setTitle] = useState(''), [description, setDescription] = useState(''), [minutes, setMinutes] = useState(60);
  const [config, setConfig] = useState<CbtImportDefaults>({ subject: '', marks: 4, negativeMarks: 1, idealSeconds: 120, difficulty: 'Moderate' });
  const [questions, setQuestions] = useState<CbtDraftQuestion[]>([]), [active, setActive] = useState(0), [reviewed, setReviewed] = useState(false), [preview, setPreview] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]), [error, setError] = useState(''), [progress, setProgress] = useState(''), [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null), sequence = useRef(0), root = useRef<HTMLDivElement>(null);
  const question = questions[active];
  const issues = useMemo(() => questions.map(getCbtQuestionIssues), [questions]);
  const incomplete = issues.filter(items => items.length).length;
  useEffect(() => () => { sequence.current++; }, []);
  useGSAP(() => { gsap.fromTo('.cbt-import-stage', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: duration(.24), ease: 'expo.out', clearProps: 'opacity,transform' }); }, { scope: root, dependencies: [step], revertOnUpdate: true });

  async function readFile(selected: File) {
    const token = ++sequence.current;
    setError(''); setProgress('Reading ' + selected.name + '…');
    try {
      let text: string, nextFormat: 'text' | 'latex'; const notices: string[] = [];
      if (/\.pdf$/i.test(selected.name)) {
        if (selected.size > MAX_FILE_SIZE) throw new Error('Choose a PDF smaller than 25 MB.');
        const material = await extractMaterial(selected, message => { if (sequence.current !== token) throw new Error('Import cancelled.'); setProgress(message); });
        if (!material.wordCount) throw new Error('This PDF has no selectable text. OCR is needed before it can become an editable test. Use a text-layer PDF or paste the recognized text; no questions or answers have been inferred.');
        text = material.pages.map(page => '[Page ' + page.number + ']\n' + page.text).join('\n\n'); nextFormat = 'text';
        notices.push('PDF extraction keeps selectable text. Check multi-column order, diagrams, equations, and answer keys against the original paper.');
        if (material.warning) notices.push(material.warning);
      } else if (/\.tex$/i.test(selected.name)) {
        if (selected.size > 1024 * 1024) throw new Error('Choose a LaTeX source smaller than 1 MB.');
        if (!selected.size) throw new Error('This LaTeX file is empty.');
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer()); } catch { throw new Error('Save this LaTeX file as UTF-8 text and try again.'); }
        nextFormat = 'latex'; notices.push('LaTeX is read as text. External files, images, custom macros, and executable commands are not compiled or loaded.');
      } else throw new Error('Choose a PDF or a .tex LaTeX source file.');
      if (sequence.current !== token) return;
      setSource(text); setFormat(nextFormat); setSourceName(selected.name); setWarnings(notices); setTitle(value => value || selected.name.replace(/\.[^.]+$/, '')); setStep('source'); setReviewed(false);
    } catch (failure) { if (sequence.current === token) setError(failure instanceof Error ? failure.message : 'This source could not be read.'); }
    finally { if (sequence.current === token) setProgress(''); }
  }
  function cancelReading() { sequence.current++; setProgress(''); }
  function parse() {
    setError('');
    try {
      const result = format === 'latex' ? parseCbtLatex(source, config) : parseCbtText(source, config);
      setWarnings(items => [...new Set([...items, ...result.warnings])]);
      if (!result.questions.length) { setError('No questions were recognized. Review the extracted text below, add numbered question and option markers, and parse again. Scanned images and missing diagrams need OCR or manual entry.'); return; }
      setQuestions(result.questions); setActive(0); setReviewed(false); setPreview(false); setStep('review');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'This question source could not be parsed.'); }
  }
  function change(patch: Partial<TestQuestion>) { setQuestions(items => items.map((item, index) => index === active ? { ...item, ...patch } : item)); setReviewed(false); setError(''); }
  function addQuestion() {
    if (questions.length >= 1000) return;
    setQuestions(items => [...items, { id: crypto.randomUUID(), sourceNumber: 'Manual', prompt: '', subject: config.subject, chapter: '', topic: '', difficulty: config.difficulty, kind: 'single', options: ['', ''], correctAnswers: [], marks: config.marks, negativeMarks: config.negativeMarks, idealSeconds: config.idealSeconds, explanation: '' }]); setActive(questions.length); setReviewed(false); setPreview(false);
  }
  function save() {
    setError('');
    if (!reviewed) { setError('Review the extracted questions and confirm the answer keys before creating the test.'); return; }
    if (incomplete) { setActive(issues.findIndex(items => items.length)); setError('Complete each flagged question before creating the test.'); return; }
    try {
      const now = Date.now();
      const paper = validatePaper({ id: crypto.randomUUID(), title, description, durationMinutes: minutes,
        questions: questions.map(({ sourceNumber: _number, sourcePage: _page, ...item }) => item), createdAt: now, updatedAt: now });
      onSave(paper);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check the test settings and try again.'); }
  }

  return <Modal title="Turn a PDF or LaTeX paper into a test" onClose={onClose} wide><div className="cbt-import" ref={root}>
    <ol className="cbt-import-steps" aria-label="Import progress">{['Source', 'Extract', 'Review'].map((label, index) => <li key={label} aria-current={(progress ? index === 1 : step === 'source' ? index === 0 : index === 2) ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    <div className="cbt-import-stage">
      <div className="cbt-import-paper-fields"><label>Test title<input value={title} maxLength={300} onChange={event => { setTitle(event.target.value); setReviewed(false); }} placeholder="Name your paper" /></label><label>Duration · minutes<input type="number" min={1} max={1440} value={minutes} onChange={event => { setMinutes(Number(event.target.value)); setReviewed(false); }} /></label></div>
      <label>Test instructions · optional<textarea rows={2} value={description} maxLength={10000} onChange={event => { setDescription(event.target.value); setReviewed(false); }} placeholder="Add any instructions your test taker should see." /></label>
      {step === 'source' ? <>
        <div className={'cbt-import-drop ' + (dragging ? 'dragging' : '')} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!progress && event.dataTransfer.files[0]) void readFile(event.dataTransfer.files[0]); }}><span><Upload size={25} /></span><div><b>{sourceName || 'Bring your own question paper'}</b><p>PDF with selectable text · up to 25 MB, or UTF-8 .tex · up to 1 MB</p></div><button type="button" className="button secondary small" disabled={!!progress} onClick={() => file.current?.click()}><FileText size={14} />Choose file</button></div>
        {progress && <div className="cbt-import-progress" role="status"><LoaderCircle size={16} className="cbt-import-spin" /><span>{progress}</span><button type="button" className="text-link" onClick={cancelReading}>Cancel reading</button></div>}
        <p className="cbt-import-note">Processing stays in this browser. The parser reads existing questions and supplied answers; it never writes an answer key for you. Scanned pages need OCR first.</p>
        <div className="cbt-import-defaults"><label>Default subject<input value={config.subject} maxLength={200} onChange={event => setConfig(value => ({ ...value, subject: event.target.value }))} placeholder="Fill only when the source omits it" /></label><label>Correct marks<input type="number" min={.001} max={100000} step="any" value={config.marks} onChange={event => setConfig(value => ({ ...value, marks: Number(event.target.value) }))} /></label><label>Wrong-answer penalty<input type="number" min={0} max={100000} step="any" value={config.negativeMarks} onChange={event => setConfig(value => ({ ...value, negativeMarks: Number(event.target.value) }))} /></label><label>Target seconds<input type="number" min={1} max={86400} value={config.idealSeconds} onChange={event => setConfig(value => ({ ...value, idealSeconds: Number(event.target.value) }))} /></label></div>
        <p className="cbt-import-note">Defaults fill missing metadata. Questions without a subject or a correct answer stay flagged until you supply them.</p>
        <label className="cbt-import-source-label"><span>Extracted text or pasted LaTeX<select aria-label="Question source syntax" value={format} disabled={!!progress} onChange={event => setFormat(event.target.value as 'text' | 'latex')}><option value="text">Numbered question text / PDF</option><option value="latex">LaTeX source</option></select></span><textarea rows={12} value={source} maxLength={4_000_000} disabled={!!progress} spellCheck={false} onChange={event => setSource(event.target.value)} placeholder="Paste your actual numbered questions and answer key, or upload a paper above." /></label>
        <details className="cbt-import-help"><summary>Recognized layouts and limitations</summary><p>Numbered questions with (A), (B), A., or A) choices; explicit Answer: lines; and a trailing Answer key section such as 1: B. Numeric answers use Answer: 2.5, with optional ± tolerance.</p><p>LaTeX supports the exam package’s question / part and choices / CorrectChoice commands, plus nested enumerate questions and options. Math delimiters and fractions are preserved for preview. Arbitrary columns, diagrams, custom macros, and missing answer keys require manual correction. Parsing again replaces the current review draft.</p></details>
      </> : question ? <>
        <div className={'cbt-import-review-status ' + (incomplete ? 'needs-review' : 'complete')}><span>{incomplete ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}</span><div><b>{questions.length} question{questions.length === 1 ? '' : 's'} extracted · {incomplete ? incomplete + ' need attention' : 'required fields complete'}</b><p>Check every prompt, option, diagram reference, and answer against your source before saving.</p></div>{incomplete > 0 && <button type="button" className="text-link" onClick={() => { setActive(issues.findIndex(items => items.length)); setPreview(false); }}>First issue<ArrowRight size={13} /></button>}</div>
        <div className="cbt-import-review-layout"><nav className="cbt-import-question-index" aria-label="Extracted questions">{questions.map((item, index) => <button type="button" key={item.id} aria-current={active === index ? 'step' : undefined} className={active === index ? 'active' : ''} onClick={() => { setActive(index); setPreview(false); }}><span>{index + 1}</span><b>Source {item.sourceNumber}{item.sourcePage ? ' · p. ' + item.sourcePage : ''}<small>{item.prompt || 'Question text needed'}</small></b>{issues[index].length ? <AlertCircle size={13} /> : <Check size={13} />}</button>)}<button type="button" disabled={questions.length >= 1000} onClick={addQuestion}><Plus size={13} />Add question</button></nav><section className="cbt-import-question" key={question.id}>
          <div className="cbt-import-question-heading"><div><span className="eyebrow">SOURCE {question.sourceNumber}{question.sourcePage ? ' · PAGE ' + question.sourcePage : ''}</span><h3>Question {active + 1}</h3></div><div><button type="button" className="button secondary small" onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button><button type="button" className="icon-btn" aria-label={'Remove imported question ' + (active + 1)} disabled={questions.length <= 1} onClick={() => { setQuestions(items => items.filter((_, index) => index !== active)); setActive(Math.max(0, active - 1)); setReviewed(false); }}><Trash2 size={15} /></button></div></div>
          {issues[active].length > 0 && <ul className="cbt-import-issues" aria-label="Required corrections">{issues[active].map(issue => <li key={issue}>{issue}</li>)}</ul>}
          {preview ? <div className="cbt-import-preview"><Markdown>{question.prompt}</Markdown>{question.kind === 'numeric' ? <p>Correct answer: <b>{question.numericAnswer ?? 'Not supplied'}</b> · tolerance ±{question.tolerance ?? 0}</p> : question.options.map((option, index) => <div className={question.correctAnswers.includes(index) ? 'correct' : ''} key={index}><b>{String.fromCharCode(65 + index)}</b><Markdown>{option}</Markdown>{question.correctAnswers.includes(index) && <Check size={14} />}</div>)}{question.explanation && <Markdown>{question.explanation}</Markdown>}</div> : <>
            <div className="cbt-import-fields"><label>Answer type<select value={question.kind} onChange={event => { const kind = event.target.value as TestQuestion['kind']; change({ kind, correctAnswers: kind === 'single' && question.correctAnswers.length > 1 ? [] : question.correctAnswers, options: kind !== 'numeric' && question.options.length < 2 ? ['', ''] : question.options }); }}><option value="single">Single correct option</option><option value="multiple">Multiple correct options</option><option value="numeric">Numerical answer</option></select></label><label>Subject<input value={question.subject} maxLength={200} onChange={event => change({ subject: event.target.value })} /></label><label>Chapter<input value={question.chapter} maxLength={200} onChange={event => change({ chapter: event.target.value })} /></label><label>Topic<input value={question.topic} maxLength={200} onChange={event => change({ topic: event.target.value })} /></label></div>
            <label>Question · Markdown and LaTeX<textarea rows={5} value={question.prompt} maxLength={50000} onChange={event => change({ prompt: event.target.value })} /></label>
            {question.kind === 'numeric' ? <div className="cbt-import-fields"><label>Correct numerical answer<input type="number" step="any" value={question.numericAnswer ?? ''} onChange={event => change({ numericAnswer: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><label>Tolerance · ±<input type="number" step="any" min={0} value={question.tolerance ?? 0} onChange={event => change({ tolerance: Number(event.target.value) })} /></label></div> : <fieldset className="cbt-import-options"><legend>Select {question.kind === 'single' ? 'the correct option' : 'every correct option'}</legend>{question.options.map((option, index) => <div key={index}><input type={question.kind === 'single' ? 'radio' : 'checkbox'} name={'import-answer-' + question.id} aria-label={'Option ' + String.fromCharCode(65 + index) + ' is correct'} checked={question.correctAnswers.includes(index)} onChange={() => change({ correctAnswers: question.kind === 'single' ? [index] : question.correctAnswers.includes(index) ? question.correctAnswers.filter(value => value !== index) : [...question.correctAnswers, index].sort((a, b) => a - b) })} /><span>{String.fromCharCode(65 + index)}</span><textarea rows={2} aria-label={'Imported option ' + String.fromCharCode(65 + index)} value={option} onChange={event => change({ options: question.options.map((value, position) => position === index ? event.target.value : value) })} /><button type="button" className="icon-btn" aria-label={'Remove option ' + String.fromCharCode(65 + index)} onClick={() => change({ options: question.options.filter((_, position) => position !== index), correctAnswers: question.correctAnswers.filter(value => value !== index).map(value => value > index ? value - 1 : value) })}><Trash2 size={12} /></button></div>)}<button type="button" className="text-link" disabled={question.options.length >= 20} onClick={() => change({ options: [...question.options, ''] })}><Plus size={13} />Add option</button></fieldset>}
            <div className="cbt-import-fields"><label>Correct marks<input type="number" min={.001} max={100000} step="any" value={question.marks} onChange={event => change({ marks: Number(event.target.value) })} /></label><label>Wrong-answer penalty<input type="number" min={0} max={100000} step="any" value={question.negativeMarks} onChange={event => change({ negativeMarks: Number(event.target.value) })} /></label><label>Difficulty<select value={question.difficulty} onChange={event => change({ difficulty: event.target.value as TestQuestion['difficulty'] })}><option>Easy</option><option>Moderate</option><option>Tough</option></select></label><label>Target seconds<input type="number" min={1} max={86400} value={question.idealSeconds} onChange={event => change({ idealSeconds: Number(event.target.value) })} /></label></div><label>Supplied solution / explanation<textarea rows={3} value={question.explanation} onChange={event => change({ explanation: event.target.value })} /></label>
          </>}
        </section></div>
        <label className="cbt-import-review-check"><input type="checkbox" checked={reviewed} disabled={incomplete > 0} onChange={event => setReviewed(event.target.checked)} /><span>I checked the extracted questions, answer keys, and scoring against my source.</span></label>
      </> : null}
      {warnings.length > 0 && <details className="cbt-import-warnings"><summary>{warnings.length} import note{warnings.length === 1 ? '' : 's'}</summary><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
      {error && <p className="cbt-import-error" role="alert">{error}</p>}
      <input hidden ref={file} type="file" accept=".pdf,.tex,application/pdf,application/x-tex,text/x-tex" onChange={event => { const selected = event.target.files?.[0]; if (selected) void readFile(selected); event.target.value = ''; }} />
    </div>
  </div><footer className="modal-footer cbt-import-footer">{step === 'review' ? <><button type="button" className="button secondary" onClick={() => { setStep('source'); setError(''); }}><ArrowLeft size={14} />Source & settings</button><button type="button" className="button primary" disabled={!questions.length || incomplete > 0 || !reviewed || !title.trim() || !Number.isFinite(minutes) || minutes < 1 || minutes > 1440} onClick={save}>Create test<Check size={15} /></button></> : <><button type="button" className="button secondary" onClick={onClose}>Cancel</button>{questions.length > 0 && <button type="button" className="button secondary" disabled={!!progress} onClick={() => setStep('review')}>Previous draft</button>}<button type="button" className="button primary" disabled={!source.trim() || !!progress} onClick={parse}>Parse questions<ArrowRight size={15} /></button></>}</footer></Modal>;
}
