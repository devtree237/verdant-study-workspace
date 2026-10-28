import { SmoothSelect } from './components/ui/SmoothSelect';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, FileKey2, FileText, LoaderCircle, LockKeyhole, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { MAX_FILE_SIZE } from './materials';
import { CbtVaultSource } from './CbtVaultSource';
import { getCbtQuestionIssues, parseCbtLatex, parseCbtText } from './cbt-import';
import type { CbtDraftQuestion, CbtImportDefaults } from './cbt-import';
import { readCbtPdf } from './cbt-pdf';
import { mergeCbtAnswerKey, normalizeCbtSourceNumber, parseCbtAnswerKey } from './cbt-answer-key';
import type { CbtAnswerKeyMergeResult } from './cbt-answer-key';
import { validatePaper } from './testing-model';
import type { TestPaper, TestQuestion, TestQuestionGroup } from './testing-model';
import { useStore } from './store';
import { QuestionGroups } from './QuestionGroups';
import { applyQuestionGroups, questionGroupsNeedApply, assertPaperMarking, assertWorkspaceGroupSubjects, createQuestionGroups } from './test-authoring';
import { Markdown, Modal, duration, gsap, useGSAP } from './ui';
import './cbt-import.css';

type SourceFormat = 'text' | 'latex';
type PdfLayout = 'auto' | 'single' | 'two-column';
const layoutOptions = <><option value="auto">Auto detect columns</option><option value="single">Single column</option><option value="two-column">Two columns · left first</option></>;
const keyStatusLabels = { applied: 'Ready to apply', kept: 'Already supplied', conflict: 'Conflicting key', unmatched: 'No question match', ambiguous: 'Ambiguous number', invalid: 'Invalid key' };
export function keyBlocksFor(questions: CbtDraftQuestion[], result: CbtAnswerKeyMergeResult, previous: Record<string, string> = {}) {
  const blocks: Record<string, string> = Object.fromEntries(Object.entries(previous).filter(([id]) => questions.some(question => question.id === id)));
  result.rows.filter(row => ['applied', 'kept'].includes(row.status)).forEach(row => {
    const number = normalizeCbtSourceNumber(row.sourceNumber);
    if (!number) return;
    const matches = questions.filter(question => normalizeCbtSourceNumber(question.sourceNumber) === number);
    if (matches.length === 1) delete blocks[matches[0].id];
  });
  result.rows.filter(row => ['conflict', 'ambiguous', 'invalid'].includes(row.status)).forEach(row => {
    const number = normalizeCbtSourceNumber(row.sourceNumber);
    if (!number) return;
    questions.filter(question => normalizeCbtSourceNumber(question.sourceNumber) === number).forEach(question => { blocks[question.id] = row.message; });
  });
  return blocks;
}
export function getCbtImportReadiness({ questions, keyBlocks, keySource, keyFormat, keyMode, appliedKey, keyReading, reviewed, title, minutes }: {
  questions: CbtDraftQuestion[]; keyBlocks: Record<string, string>; keySource: string; keyFormat: SourceFormat; keyMode: 'fill' | 'replace'; appliedKey: string; keyReading: boolean; reviewed: boolean; title: string; minutes: number;
}) {
  const issues = questions.map(question => [...getCbtQuestionIssues(question), ...(keyBlocks[question.id] ? ['Separate answer key: ' + keyBlocks[question.id]] : [])]);
  const incomplete = issues.filter(items => items.length).length;
  const keyPending = !!keySource.trim() && JSON.stringify([keySource, keyFormat, keyMode]) !== appliedKey;
  const canReview = questions.length > 0 && incomplete === 0 && !keyPending && !keyReading;
  return { issues, incomplete, keyPending, canReview, canSave: canReview && reviewed && !!title.trim() && Number.isFinite(minutes) && minutes >= 1 && minutes <= 1440 };
}
const optionLabel = (question: CbtDraftQuestion, index: number) => question.sourceOptionLabels?.[index] || String.fromCharCode(65 + index);
export function nextCbtSourceNumber(questions:CbtDraftQuestion[]):string{const used=new Set(questions.map(question=>normalizeCbtSourceNumber(question.sourceNumber)));let next=questions.length+1;while(used.has(String(next)))next++;return String(next);}
export function assertCbtImportSetup(config:CbtImportDefaults,subjects:string[]){assertPaperMarking(config);if(!subjects.includes(config.subject))throw new Error('Choose a subject from your workspace before parsing the paper.');}
function nextOptionLabel(question: CbtDraftQuestion) {
  const used = new Set(question.options.map((_, index) => optionLabel(question, index).toUpperCase().replace(/[()\s]/g, '')));
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(label => !used.has(label)) || String(question.options.length + 1);
}

export function CbtImport({ onClose, onSave }: { onClose: () => void; onSave: (paper: TestPaper) => void }) {
  const { data: workspace } = useStore();
  const subjects = workspace.subjects.map(subject=>subject.name);
  const [step, setStep] = useState<'source' | 'review'>('source'), [format, setFormat] = useState<'text' | 'latex'>('text');
  const [source, setSource] = useState(''), [sourceName, setSourceName] = useState(''), [title, setTitle] = useState(''), [description, setDescription] = useState(''), [minutes, setMinutes] = useState(60);
  const [config, setConfig] = useState<CbtImportDefaults>({ subject: subjects[0] || '', marks: 4, negativeMarks: 1, idealSeconds: 120, difficulty: 'Moderate' });
  const [groups,setGroups] = useState<TestQuestionGroup[]>([]), [appliedGroups,setAppliedGroups] = useState(''), [markingLocked,setMarkingLocked] = useState(false);
  const [questions, setQuestions] = useState<CbtDraftQuestion[]>([]), [active, setActive] = useState(0), [reviewed, setReviewed] = useState(false), [preview, setPreview] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]), [error, setError] = useState(''), [progress, setProgress] = useState(''), [dragging, setDragging] = useState(false);
  const [layout, setLayout] = useState<PdfLayout>('auto'), [questionFile, setQuestionFile] = useState<File | null>(null);
  const [keySource, setKeySource] = useState(''), [keyFormat, setKeyFormat] = useState<SourceFormat>('text'), [keyMode, setKeyMode] = useState<'fill' | 'replace'>('fill');
  const [keyName, setKeyName] = useState(''), [keyFile, setKeyFile] = useState<File | null>(null), [keyLayout, setKeyLayout] = useState<PdfLayout>('auto');
  const [keyProgress, setKeyProgress] = useState(''), [keyError, setKeyError] = useState(''), [keyNotices, setKeyNotices] = useState<string[]>([]), [keyAppliedNotice, setKeyAppliedNotice] = useState('');
  const [appliedKey, setAppliedKey] = useState(''), [keyBlocks, setKeyBlocks] = useState<Record<string, string>>({}), [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false), [vaultPicker, setVaultPicker] = useState(false), [keyDragging, setKeyDragging] = useState(false), [vaultReading, setVaultReading] = useState(false);
  const file = useRef<HTMLInputElement>(null), keyInput = useRef<HTMLInputElement>(null), sequence = useRef(0), keySequence = useRef(0), root = useRef<HTMLDivElement>(null);
  const question = questions[active];
  const keySignature = JSON.stringify([keySource, keyFormat, keyMode]);
  const readiness = useMemo(() => getCbtImportReadiness({ questions, keyBlocks, keySource, keyFormat, keyMode, appliedKey, keyReading: !!keyProgress || vaultReading, reviewed, title, minutes }), [questions, keyBlocks, keySource, keyFormat, keyMode, appliedKey, keyProgress, vaultReading, reviewed, title, minutes]);
  const { issues,incomplete,keyPending } = readiness;
  const groupsPending = JSON.stringify(groups) !== appliedGroups && questionGroupsNeedApply(questions,groups,config);
  const validSubjects = groups.filter(group=>group.questionIds.length).every(group=>subjects.includes(group.subject));
  const canReview = readiness.canReview && !groupsPending && validSubjects && markingLocked;
  const canSave = readiness.canSave && canReview;
  const keyPreview = useMemo(() => {
    if (!keySource.trim()) return null;
    try { const parsed = parseCbtAnswerKey(keySource, keyFormat); return { parsed, merged: mergeCbtAnswerKey(questions, parsed, keyMode), error: '' }; }
    catch (failure) { return { parsed: null, merged: null, error: failure instanceof Error ? failure.message : 'This answer key could not be parsed.' }; }
  }, [keySource, keyFormat, keyMode, questions]);
  useEffect(() => () => { sequence.current++; keySequence.current++; }, []);
  useGSAP(() => { gsap.fromTo('.cbt-import-stage', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: duration(.24), ease: 'expo.out', clearProps: 'opacity,transform' }); }, { scope: root, dependencies: [step], revertOnUpdate: true });

  async function readSource(selected: File, pdfLayout: PdfLayout, onProgress: (message: string) => void) {
    let text: string, nextFormat: SourceFormat; const notices: string[] = [];
    if (/\.pdf$/i.test(selected.name)) {
      if (selected.size > MAX_FILE_SIZE) throw new Error('Choose a PDF smaller than 25 MB.');
      const result = await readCbtPdf(selected, onProgress, pdfLayout);
      text = result.text; nextFormat = 'text'; notices.push(...result.warnings);
      if (!text.replace(/\[Page\s+\d+\]/gi, '').trim()) throw new Error('This PDF has no selectable text. Use OCR first or paste recognized text. No questions or answers have been inferred.');
      notices.push('Check the extracted column order, diagrams, equations, and answer labels against the original PDF.');
    } else if (/\.tex$/i.test(selected.name)) {
      if (selected.size > 1024 * 1024) throw new Error('Choose a LaTeX source smaller than 1 MB.');
      if (!selected.size) throw new Error('This LaTeX file is empty.');
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await selected.arrayBuffer()); } catch { throw new Error('Save this LaTeX file as UTF-8 text and try again.'); }
      nextFormat = 'latex'; notices.push('LaTeX is read as text. External files, images, custom macros, and executable commands are not compiled or loaded.');
    } else throw new Error('Choose a PDF or a .tex LaTeX source file.');
    if (text.length > 4_000_000) throw new Error('This source exceeds 4 million characters. Split it into smaller papers before importing.');
    return { text, format: nextFormat, notices };
  }
  async function readFile(selected: File) {
    const token = ++sequence.current;
    setError(''); setProgress('Reading ' + selected.name + '…'); setReviewed(false);
    try {
      const result = await readSource(selected, layout, message => { if (sequence.current !== token) throw new Error('Import cancelled.'); setProgress(message); });
      if (sequence.current !== token) return;
      setQuestionFile(selected); setSource(result.text); setFormat(result.format); setSourceName(selected.name); setWarnings(result.notices); setTitle(value => value || selected.name.replace(/\.[^.]+$/, '')); setStep('source');
    } catch (failure) { if (sequence.current === token) setError(failure instanceof Error ? failure.message : 'This source could not be read.'); }
    finally { if (sequence.current === token) setProgress(''); }
  }
  async function readKeyFile(selected: File) {
    const token = ++keySequence.current;
    setKeyError(''); setKeyProgress('Reading ' + selected.name + '…'); setReviewed(false); setKeyAppliedNotice('');
    try {
      const result = await readSource(selected, keyLayout, message => { if (keySequence.current !== token) throw new Error('Key import cancelled.'); setKeyProgress(message); });
      if (keySequence.current !== token) return;
      setKeyFile(selected); setKeySource(result.text); setKeyFormat(result.format); setKeyName(selected.name); setKeyNotices(result.notices);
    } catch (failure) { if (keySequence.current === token) setKeyError(failure instanceof Error ? failure.message : 'This answer key could not be read.'); }
    finally { if (keySequence.current === token) setKeyProgress(''); }
  }
  function cancelReading() { sequence.current++; setProgress(''); }
  function parse() {
    if (vaultReading || progress || keyProgress) return;
    setError('');
    try {
      assertCbtImportSetup(config,subjects);
      const result = format === 'latex' ? parseCbtLatex(source, config) : parseCbtText(source, config);
      setWarnings(items => [...new Set([...items, ...result.warnings])]);
      if (!result.questions.length) { setError('No questions were recognized. Review the extracted text below, add numbered question and option markers, and parse again. Scanned images and missing diagrams need OCR or manual entry.'); return; }
      let draft = result.questions; let blocks: Record<string,string> = {}, notice = '', signature = '';
      const notices: string[] = [];
      const embedded = ('embeddedSource' in result && typeof result.embeddedSource === 'string' ? result.embeddedSource : '') || (format === 'text' ? source.match(/^(?:\*\*)?\s*(?:answer\s*key|(?:detailed\s+)?solutions?)\b[^\n]*\n[\s\S]*$/im)?.[0] : '');
      if (embedded) {
        const supplied = parseCbtAnswerKey(embedded, format);
        if (supplied.entries.length) {
          const merged = mergeCbtAnswerKey(draft, supplied);
          draft = merged.questions;
          notices.push(...merged.warnings, `Embedded source: ${merged.applied} answers and ${merged.solutionsApplied || 0} supplied solutions attached.`);
          blocks = keyBlocksFor(draft, merged);
        }
      }
      if (keySource.trim()) {
        const parsed = parseCbtAnswerKey(keySource, keyFormat);
        if (!parsed.entries.length) throw new Error('The separate answer key has no recognized numbered answers. Correct or remove it before parsing questions.');
        if (keyMode === 'replace' && !replaceConfirmed) throw new Error('Confirm replacing matching answer keys in the answer-key panel before applying them.');
        const merged = mergeCbtAnswerKey(draft, parsed, keyMode);
        draft = merged.questions; blocks = keyBlocksFor(draft, merged, blocks); signature = keySignature; notice = `${merged.applied} answer keys and ${merged.solutionsApplied || 0} solutions applied to the parsed draft.`;
      }
      draft=draft.map(question=>({...question,subject:subjects.find(name=>name.toLowerCase()===question.subject.toLowerCase()) || config.subject,marks:config.marks,negativeMarks:config.negativeMarks}));
      const nextGroups=createQuestionGroups(draft);
      setGroups(nextGroups);setAppliedGroups(JSON.stringify(nextGroups));setMarkingLocked(true);
      setKeyBlocks(blocks); setAppliedKey(signature); setKeyAppliedNotice(notice); setWarnings(items=>[...new Set([...items,...notices])]);
      setQuestions(draft); setActive(0); setReviewed(false); setPreview(false); setStep('review');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'This question source could not be parsed.'); }
  }
  function change(patch: Partial<CbtDraftQuestion>, resolvesKey = false) {
    setQuestions(items => items.map((item, index) => index === active ? { ...item, ...patch } : item));
    if (resolvesKey) setKeyBlocks(value => { const next = { ...value }; delete next[question.id]; return next; });
    setReviewed(false); setError('');
  }
  function applyKey() {
    setKeyError('');
    if(groupsPending){setKeyError('Apply your group settings before applying this answer key.');return;}
    if (!keyPreview?.parsed?.entries.length || !keyPreview.merged) { setKeyError(keyPreview?.error || 'Add numbered answers to preview and apply a key.'); return; }
    if (keyMode === 'replace' && !replaceConfirmed) { setKeyError('Confirm that replacing matching keys may overwrite your manual answers.'); return; }
    const result = keyPreview.merged;
    const nextGroups=groups.map(group=>({...group,kind:group.kind==='single'&&result.questions.some(question=>group.questionIds.includes(question.id)&&question.kind==='multiple')?'multiple' as const:group.kind}));
    const draft=applyQuestionGroups(result.questions,nextGroups,config);
    setGroups(nextGroups);setAppliedGroups(JSON.stringify(nextGroups));setQuestions(draft); setKeyBlocks(previous => keyBlocksFor(draft, result, previous)); setAppliedKey(keySignature); setReviewed(false);
    setKeyAppliedNotice(`${result.applied} answer keys and ${result.solutionsApplied || 0} solutions applied. ${result.rows.filter(row => ['conflict', 'ambiguous', 'invalid'].includes(row.status)).length} mapping issues require review.`);
  }
  function addQuestion() {
    if (questions.length >= 1000) return;
    if(groupsPending){setError('Apply the group settings before adding another question.');return;}
    const group=groups.find(item=>item.questionIds.includes(question?.id))||groups[0],id=crypto.randomUUID();
    const draft:CbtDraftQuestion={id,sourceNumber:nextCbtSourceNumber(questions),prompt:'',subject:group?.subject||config.subject,chapter:'',topic:'',difficulty:config.difficulty,kind:group?.kind||'single',options:group?.kind==='numeric'?[]:['','','',''],correctAnswers:[],marks:config.marks,negativeMarks:config.negativeMarks,idealSeconds:config.idealSeconds,explanation:''};
    const nextGroups=groups.map(item=>item.id===group?.id?{...item,questionIds:[...item.questionIds,id]}:item);
    setQuestions(items=>[...items,draft]);setGroups(nextGroups);setAppliedGroups(JSON.stringify(nextGroups));setActive(questions.length);setReviewed(false);setPreview(false);
  }
  function removeQuestion(){const nextGroups=groups.map(group=>({...group,questionIds:group.questionIds.filter(id=>id!==question.id)}));setQuestions(items=>items.filter(item=>item.id!==question.id));setGroups(nextGroups);if(!groupsPending)setAppliedGroups(JSON.stringify(nextGroups));setActive(Math.max(0,active-1));setKeyBlocks(value=>{const next={...value};delete next[question.id];return next;});setReviewed(false);}
  function applyGroups(){try{assertWorkspaceGroupSubjects(groups,subjects);const next=applyQuestionGroups(questions,groups,config);setQuestions(next);setAppliedGroups(JSON.stringify(groups));setReviewed(false);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'Review your question groups.');}}
  function save() {
    setError('');
    if (keyPending || keyProgress || vaultReading) { setKeyOpen(true); setError('Finish reading, then apply or remove the pending separate answer key before creating the test.'); return; }
    if(groupsPending){setError('Apply question group settings before creating the test.');return;}
    if (!reviewed) { setError('Review the extracted questions and confirm the answer keys before creating the test.'); return; }
    if (incomplete) { setActive(issues.findIndex(items => items.length)); setError('Complete each flagged question before creating the test.'); return; }
    try {
      const nonemptyGroups=groups.filter(group=>group.questionIds.length);assertWorkspaceGroupSubjects(nonemptyGroups,subjects);
      const now = Date.now();
      const paper = validatePaper({ id: crypto.randomUUID(), title, description, durationMinutes: minutes,
        questions: questions.map(({ sourceNumber: _number, sourcePage: _page, sourceOptionLabels: _labels, ...item }) => { const clean = { ...item }; delete (clean as Record<string,unknown>).sourceMetadata; return clean; }),groups:nonemptyGroups,marking:{marks:config.marks,negativeMarks:config.negativeMarks},createdAt: now, updatedAt: now });
      onSave(paper);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Check the test settings and try again.'); }
  }

  return <Modal title="Turn a PDF or LaTeX paper into a test" onClose={onClose} wide><div className="cbt-import" ref={root}>
    <ol className="cbt-import-steps" aria-label="Import progress">{['Source', 'Extract', 'Review'].map((label, index) => <li key={label} aria-current={(progress ? index === 1 : step === 'source' ? index === 0 : index === 2) ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    <div className="cbt-import-stage">
      <div className="cbt-import-paper-fields"><label>Test title<input value={title} maxLength={300} onChange={event => { setTitle(event.target.value); setReviewed(false); }} placeholder="Name your paper" /></label><label>Duration · minutes<input type="number" min={1} max={1440} value={minutes} onChange={event => { setMinutes(Number(event.target.value)); setReviewed(false); }} /></label></div>
      <label>Test instructions · optional<textarea rows={2} value={description} maxLength={10000} onChange={event => { setDescription(event.target.value); setReviewed(false); }} placeholder="Add any instructions your test taker should see." /></label>
      <details className="cbt-key-panel" open={keyOpen} onToggle={event => setKeyOpen(event.currentTarget.open)}>
        <summary><span className="cbt-key-icon"><FileKey2 size={18}/></span><span><b>Attach Answer Key / Solutions <em>optional</em></b><small>{keyName || 'PDF or LaTeX · upload, paste, or select from Resource Vault'}</small></span><span className={`cbt-key-badge ${keyPending || Object.keys(keyBlocks).length ? 'attention' : ''}`}>{keyProgress ? 'Reading…' : keyPending ? 'Changes pending' : Object.keys(keyBlocks).length ? 'Review needed' : keySource.trim() ? 'Source attached' : 'Add key'}</span></summary>
        <div className="cbt-key-body">
          <p className="cbt-import-note">Match answers by the original question number. Duplicate or missing numbers are never matched by position. Your paper can also include its own answer key.</p>
          <div className={'cbt-key-drop '+(keyDragging?'dragging':'')} onDragOver={event=>{event.preventDefault();setKeyDragging(true);}} onDragLeave={()=>setKeyDragging(false)} onDrop={event=>{event.preventDefault();setKeyDragging(false);if(!keyProgress&&event.dataTransfer.files[0])void readKeyFile(event.dataTransfer.files[0]);}}><Upload size={18}/><span>Drop an answer-key or solutions PDF / LaTeX file here</span><button type="button" className="button secondary small" disabled={!!keyProgress} onClick={() => keyInput.current?.click()}>Choose key PDF / LaTeX</button></div>
          <div className="cbt-key-upload-row"><button type="button" className="text-link" disabled={!!keyProgress} onClick={()=>setVaultPicker(!vaultPicker)}>Select from Previous PDFs / Resource Vault</button><label>Key PDF layout<SmoothSelect aria-label="Answer key PDF column layout" value={keyLayout} disabled={!!keyProgress} onChange={event => setKeyLayout(event.target.value as PdfLayout)}>{layoutOptions}</SmoothSelect></label>{keyFile && /\.pdf$/i.test(keyFile.name) && <button type="button" className="text-link" disabled={!!keyProgress} onClick={() => void readKeyFile(keyFile)}><RotateCcw size={12}/>Re-read PDF</button>}</div>
          {vaultPicker&&<CbtVaultSource onReadingChange={setVaultReading} layout={keyLayout} onCancel={()=>setVaultPicker(false)} onSelect={result=>{setKeySource(result.text);setKeyFormat(result.format);setKeyName(result.name);setKeyFile(null);setKeyNotices(result.notices);setKeyError('');setKeyAppliedNotice('');setReviewed(false);setVaultPicker(false);}}/>}
          {keyProgress && <div className="cbt-import-progress" role="status"><LoaderCircle size={16} className="cbt-import-spin"/><span>{keyProgress}</span><button type="button" className="text-link" onClick={() => { keySequence.current++; setKeyProgress(''); }}>Cancel key reading</button></div>}
          <label className="cbt-import-source-label"><span>Numbered answer-key text<SmoothSelect aria-label="Answer key source syntax" value={keyFormat} disabled={!!keyProgress} onChange={event => { setKeyFormat(event.target.value as SourceFormat); setReviewed(false); setKeyAppliedNotice(''); }}><option value="text">Numbered text / PDF</option><option value="latex">LaTeX source</option></SmoothSelect></span><textarea aria-label="Separate answer key text" rows={5} spellCheck={false} maxLength={4_000_000} disabled={!!keyProgress} value={keySource} onChange={event => { setKeySource(event.target.value); setReviewed(false); setKeyError(''); setKeyAppliedNotice(''); }} placeholder="Paste your actual numbered answers here."/></label>
          <div className="cbt-key-mode-row"><label>Apply mode<SmoothSelect aria-label="Separate answer key apply mode" value={keyMode} disabled={!!keyProgress} onChange={event => { setKeyMode(event.target.value as 'fill' | 'replace'); setReplaceConfirmed(false); setReviewed(false); setKeyAppliedNotice(''); }}><option value="fill">Fill missing answers</option><option value="replace">Replace matching answers</option></SmoothSelect></label><p>{keyMode === 'fill' ? 'Existing answers are kept. A different supplied key is flagged for your review.' : 'Valid keys replace existing answers only when a source number matches exactly one question. Manual answer edits can be overwritten.'}</p></div>
          {keyMode === 'replace' && <label className="cbt-key-replace-check"><input type="checkbox" checked={replaceConfirmed} onChange={event => { setReplaceConfirmed(event.target.checked); setReviewed(false); }}/><span>I understand that applying this key can overwrite matching answers I entered or edited.</span></label>}
          {keyPreview?.merged && <>
            <div className="cbt-key-mapping-heading"><b>Mapping preview</b><span>{keyPreview.parsed?.entries.length || 0} supplied entries · {questions.length} draft questions</span></div>
            {!questions.length && <p className="cbt-import-note">Question matching starts when you parse the paper. Supplied keys will be applied using the selected mode.</p>}
            <div className="cbt-key-counts" aria-label="Answer key mapping counts">{(['applied', 'kept', 'conflict', 'unmatched', 'ambiguous', 'invalid'] as const).map(status => { const count = keyPreview.merged!.rows.filter(row => row.status === status).length; return count > 0 ? <span className={status} key={status}><b>{count}</b>{!questions.length && status === 'unmatched' ? 'Waiting for questions' : keyStatusLabels[status]}</span> : null; })}</div>
            <div className="cbt-key-table-wrap"><table className="cbt-key-table"><thead><tr><th>Source Q</th><th>Supplied key</th><th>Match status</th><th>Details</th></tr></thead><tbody>{keyPreview.merged.rows.map((row, index) => <tr key={`${row.sourceNumber}-${index}`} className={row.status}><th scope="row">{row.sourceNumber}</th><td>{row.answerLabel || '—'}</td><td><span>{!questions.length && row.status === 'unmatched' ? 'Waiting for questions' : keyStatusLabels[row.status]}</span></td><td>{!questions.length && row.status === 'unmatched' ? 'Parse the question source to match this number.' : row.message}</td></tr>)}</tbody></table></div>
            {keyPreview.merged.rows.length === 0 && <p className="cbt-key-inline-warning">No numbered answers were recognized. Correct the source before applying it.</p>}
          </>}
          {(keyNotices.length > 0 || keyPreview?.parsed?.warnings.length || keyPreview?.merged?.warnings.length) ? <details className="cbt-import-warnings"><summary>Answer-key import notes</summary><ul>{[...new Set([...keyNotices, ...(keyPreview?.parsed?.warnings || []), ...(keyPreview?.merged?.warnings || [])])].map(notice => <li key={notice}>{notice}</li>)}</ul></details> : null}
          {(keyError || keyPreview?.error) && <p className="cbt-import-error" role="alert">{keyError || keyPreview?.error}</p>}
          {keyAppliedNotice && <p className="cbt-key-applied" role="status"><CheckCircle2 size={14}/>{keyAppliedNotice}</p>}
          {Object.keys(keyBlocks).length > 0 && <p className="cbt-key-inline-warning">Some matched questions have unresolved keys. Correct the supplied key, use an explicit replacement, or review and keep the chosen answer in each flagged question.</p>}
          {keyPending && questions.length > 0 && <p className="cbt-key-pending">These key changes have not been applied to your draft. Apply them or remove the separate key before saving.</p>}
          <div className="cbt-key-actions"><button type="button" className="text-link" disabled={!keySource && !keyName || !!keyProgress} onClick={() => { setKeySource(''); setKeyName(''); setKeyFile(null); setKeyNotices([]); setKeyError(''); setKeyAppliedNotice(''); setAppliedKey(''); setReviewed(false); }}>Remove separate key</button><button type="button" className="button secondary small" disabled={groupsPending || !questions.length || !keyPreview?.parsed?.entries.length || !!progress || !!keyProgress || keyMode === 'replace' && !replaceConfirmed} onClick={applyKey}><Check size={14}/>Apply key to draft</button></div>
          <p className="cbt-key-footnote">Removing the source does not undo answers already applied. All extracted answers still require your final review.</p>
        </div>
      </details>
      {step === 'source' ? <>
        <div className="cbt-question-layout-row"><label>Question PDF layout<SmoothSelect aria-label="Question PDF column layout" value={layout} disabled={!!progress} onChange={event => setLayout(event.target.value as PdfLayout)}>{layoutOptions}</SmoothSelect></label><span>Choose the column order before uploading, or re-read the selected PDF.</span>{questionFile && /\.pdf$/i.test(questionFile.name) && <button type="button" className="text-link" disabled={!!progress} onClick={() => void readFile(questionFile)}><RotateCcw size={12}/>Re-read PDF</button>}</div>
        <div className={'cbt-import-drop ' + (dragging ? 'dragging' : '')} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!progress && event.dataTransfer.files[0]) void readFile(event.dataTransfer.files[0]); }}><span><Upload size={25} /></span><div><b>{sourceName || 'Bring your own question paper'}</b><p>PDF with selectable text · up to 25 MB, or UTF-8 .tex · up to 1 MB</p></div><button type="button" className="button secondary small" disabled={!!progress} onClick={() => file.current?.click()}><FileText size={14} />Choose file</button></div>
        {progress && <div className="cbt-import-progress" role="status"><LoaderCircle size={16} className="cbt-import-spin" /><span>{progress}</span><button type="button" className="text-link" onClick={cancelReading}>Cancel reading</button></div>}
        <p className="cbt-import-note">Processing stays in this browser. The parser reads existing questions and supplied answers; it never writes an answer key for you. Scanned pages need OCR first.</p>
        <section className="cbt-import-paper-setup"><h3>Paper settings</h3><p className="cbt-import-note">Choose once before parsing. The same marking scheme will apply to every question.</p><div className="cbt-import-defaults"><label>Subject for this paper<SmoothSelect aria-label="Subject for this paper" value={config.subject} onChange={event=>setConfig(value=>({...value,subject:event.target.value}))}>{!subjects.length&&<option value="">Create a workspace subject first</option>}{subjects.map(name=><option key={name} value={name}>{name}</option>)}</SmoothSelect></label><label>Correct marks<input aria-label="Paper correct marks" type="number" min={.001} max={100000} step="any" disabled={markingLocked} value={config.marks} onChange={event=>setConfig(value=>({...value,marks:Number(event.target.value)}))}/></label><label>Wrong-answer penalty<input aria-label="Paper wrong-answer penalty" type="number" min={0} max={100000} step="any" disabled={markingLocked} value={config.negativeMarks} onChange={event=>setConfig(value=>({...value,negativeMarks:Number(event.target.value)}))}/></label><label>Target seconds · default<input type="number" min={1} max={86400} value={config.idealSeconds} onChange={event=>setConfig(value=>({...value,idealSeconds:Number(event.target.value)}))}/></label></div>{markingLocked&&<p className="cbt-import-note">Marking is fixed for this paper. Question-level scoring overrides are disabled.</p>}{!subjects.length&&<p className="cbt-import-error">Add your subject using “Add subject” in the workspace first. Subject names come from your own workspace.</p>}</section>
        <label className="cbt-import-source-label"><span>Extracted text or pasted LaTeX<SmoothSelect aria-label="Question source syntax" value={format} disabled={!!progress} onChange={event => setFormat(event.target.value as 'text' | 'latex')}><option value="text">Numbered question text / PDF</option><option value="latex">LaTeX source</option></SmoothSelect></span><textarea rows={12} value={source} maxLength={4_000_000} disabled={!!progress} spellCheck={false} onChange={event => setSource(event.target.value)} placeholder="Paste your actual numbered questions and answer key, or upload a paper above." /></label>
        <details className="cbt-import-help"><summary>Recognized layouts and limitations</summary><p>Numbered questions with (A), (B), A., or A) choices; explicit Answer: lines; and a trailing Answer key section such as 1: B. Numeric answers use Answer: 2.5, with optional ± tolerance.</p><p>LaTeX supports the exam package’s question / part and choices / CorrectChoice commands, plus nested enumerate questions and options. Math delimiters and fractions are preserved for preview. Arbitrary columns, diagrams, custom macros, and missing answer keys require manual correction. Parsing again replaces the current review draft.</p></details>
      </> : question ? <>
        <div className="cbt-fixed-marking"><span><LockKeyhole size={14}/>Marking fixed for this paper</span><b>+{config.marks} correct · −{config.negativeMarks} incorrect · 0 unanswered</b><span>Applies to every question</span></div>
        <QuestionGroups questions={questions} groups={groups} subjects={subjects} pending={groupsPending} disabled={!!keyProgress||vaultReading} onChange={next=>{setGroups(next);setReviewed(false);}} onApply={applyGroups}/>
        <details className="cbt-verification-grid"><summary>Verify answer key · {questions.length} questions</summary><p>Choose answers directly below. Multiple-correct questions allow more than one choice. Numeric answers open in the editor.</p><div>{questions.map((item,index)=><fieldset key={item.id} className={issues[index].length?'needs-review':''}><legend><button type="button" onClick={()=>{setActive(index);setPreview(false);}}>Q{item.sourceNumber}</button></legend>{item.kind==='numeric'?<button type="button" className="text-link" onClick={()=>setActive(index)}>{item.numericAnswer??'Set answer'}</button>:item.options.map((_,position)=><label key={position}><input type={item.kind==='multiple'?'checkbox':'radio'} name={'key-grid-'+item.id} aria-label={`Question ${item.sourceNumber} option ${optionLabel(item,position)}`} checked={item.correctAnswers.includes(position)} onChange={()=>{setQuestions(rows=>rows.map(row=>row.id===item.id?{...row,correctAnswers:row.kind==='single'?[position]:row.correctAnswers.includes(position)?row.correctAnswers.filter(value=>value!==position):[...row.correctAnswers,position].sort((a,b)=>a-b)}:row));setKeyBlocks(blocks=>{const next={...blocks};delete next[item.id];return next;});setReviewed(false);}}/><span>{optionLabel(item,position)}</span></label>)}</fieldset>)}</div></details>
        <div className={'cbt-import-review-status ' + (incomplete ? 'needs-review' : 'complete')}><span>{incomplete ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}</span><div><b>{questions.length} question{questions.length === 1 ? '' : 's'} extracted · {incomplete ? incomplete + ' need attention' : 'required fields complete'}</b><p>Check every prompt, option, diagram reference, and answer against your source before saving.</p></div>{incomplete > 0 && <button type="button" className="text-link" onClick={() => { setActive(issues.findIndex(items => items.length)); setPreview(false); }}>First issue<ArrowRight size={13} /></button>}</div>
        <div className="cbt-import-review-layout"><nav className="cbt-import-question-index" aria-label="Extracted questions">{questions.map((item, index) => <button type="button" key={item.id} aria-current={active === index ? 'step' : undefined} className={active === index ? 'active' : ''} onClick={() => { setActive(index); setPreview(false); }}><span>{index + 1}</span><b>Source {item.sourceNumber}{item.sourcePage ? ' · p. ' + item.sourcePage : ''}<small>{item.prompt || 'Question text needed'}</small></b>{issues[index].length ? <AlertCircle size={13} /> : <Check size={13} />}</button>)}<button type="button" disabled={questions.length >= 1000} onClick={addQuestion}><Plus size={13} />Add question</button></nav><section className="cbt-import-question" key={question.id}>
          <div className="cbt-import-question-heading"><div><span className="eyebrow">SOURCE {question.sourceNumber}{question.sourcePage ? ' · PAGE ' + question.sourcePage : ''}</span><h3>Question {active + 1}</h3></div><div><button type="button" className="button secondary small" onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button><button type="button" className="icon-btn" aria-label={'Remove imported question ' + (active + 1)} disabled={questions.length <= 1} onClick={removeQuestion}><Trash2 size={15} /></button></div></div>
          {issues[active].length > 0 && <ul className="cbt-import-issues" aria-label="Required corrections">{issues[active].map(issue => <li key={issue}>{issue}</li>)}</ul>}{keyBlocks[question.id] && <div className="cbt-key-resolution"><p>Check this question against both sources. Choose a corrected answer below, apply a replacement key, or explicitly keep your reviewed answer.</p><button type="button" className="button secondary small" disabled={getCbtQuestionIssues(question).length > 0} onClick={() => { setKeyBlocks(value => { const next = { ...value }; delete next[question.id]; return next; }); setReviewed(false); }}>Keep this reviewed answer<Check size={13}/></button></div>}
          {preview ? <div className="cbt-import-preview"><Markdown>{question.prompt}</Markdown>{question.kind === 'numeric' ? <p>Correct answer: <b>{question.numericAnswer ?? 'Not supplied'}</b> · tolerance ±{question.tolerance ?? 0}</p> : question.options.map((option, index) => <div className={question.correctAnswers.includes(index) ? 'correct' : ''} key={index}><b>{optionLabel(question, index)}</b><Markdown>{option}</Markdown>{question.correctAnswers.includes(index) && <Check size={14} />}</div>)}{question.explanation && <Markdown>{question.explanation}</Markdown>}</div> : <>
            <div className="cbt-question-group-summary"><b>{groups.find(group=>group.questionIds.includes(question.id))?.name||'Unassigned group'}</b><span>{question.subject||'Assign a workspace subject above'}</span><span>{question.kind==='single'?'Single correct':question.kind==='multiple'?'Multiple correct':'Numerical answer'}</span></div>
            <label>Question · Markdown and LaTeX<textarea rows={5} value={question.prompt} maxLength={50000} onChange={event => change({ prompt: event.target.value })} /></label>
            {question.kind === 'numeric' ? <div className="cbt-import-fields"><label>Correct numerical answer<input type="number" step="any" value={question.numericAnswer ?? ''} onChange={event => change({ numericAnswer: event.target.value === '' ? undefined : Number(event.target.value) }, true)} /></label><label>Tolerance · ±<input type="number" step="any" min={0} value={question.tolerance ?? 0} onChange={event => change({ tolerance: Number(event.target.value) }, true)} /></label></div> : <fieldset className="cbt-import-options"><legend>Select {question.kind === 'single' ? 'the correct option' : 'every correct option'}</legend>{question.options.map((option, index) => <div key={index}><input type={question.kind === 'single' ? 'radio' : 'checkbox'} name={'import-answer-' + question.id} aria-label={'Option ' + optionLabel(question, index) + ' is correct'} checked={question.correctAnswers.includes(index)} onChange={() => change({ correctAnswers: question.kind === 'single' ? [index] : question.correctAnswers.includes(index) ? question.correctAnswers.filter(value => value !== index) : [...question.correctAnswers, index].sort((a, b) => a - b) }, true)} /><span>{optionLabel(question, index)}</span><textarea rows={2} aria-label={'Imported option ' + optionLabel(question, index)} value={option} onChange={event => change({ options: question.options.map((value, position) => position === index ? event.target.value : value) })} /><button type="button" className="icon-btn" aria-label={'Remove option ' + optionLabel(question, index)} onClick={() => change({ sourceOptionLabels: question.options.map((_, position) => optionLabel(question, position)).filter((_, position) => position !== index), options: question.options.filter((_, position) => position !== index), correctAnswers: question.correctAnswers.filter(value => value !== index).map(value => value > index ? value - 1 : value) })}><Trash2 size={12} /></button></div>)}<button type="button" className="text-link" disabled={question.options.length >= 20} onClick={() => change({ options: [...question.options, ''], sourceOptionLabels: [...question.options.map((_, index) => optionLabel(question, index)), nextOptionLabel(question)] })}><Plus size={13} />Add option</button></fieldset>}
            <label>Supplied solution / explanation<textarea rows={3} value={question.explanation} onChange={event=>change({explanation:event.target.value})}/></label>
            <details className="cbt-import-help"><summary>Optional source details</summary><div className="cbt-import-fields"><label>Source question number<input value={question.sourceNumber} maxLength={50} onChange={event=>change({sourceNumber:event.target.value})}/></label><label>Chapter · optional<input value={question.chapter} maxLength={200} onChange={event=>change({chapter:event.target.value})}/></label><label>Topic · optional<input value={question.topic} maxLength={200} onChange={event=>change({topic:event.target.value})}/></label><label>Difficulty<SmoothSelect value={question.difficulty} onChange={event=>change({difficulty:event.target.value as TestQuestion['difficulty']})}><option>Easy</option><option>Moderate</option><option>Tough</option></SmoothSelect></label><label>Target seconds<input type="number" min={1} max={86400} value={question.idealSeconds} onChange={event=>change({idealSeconds:Number(event.target.value)})}/></label></div></details>
          </>}
        </section></div>
        <label className="cbt-import-review-check"><input type="checkbox" checked={reviewed} disabled={!canReview} onChange={event => setReviewed(event.target.checked)} /><span>I checked the extracted questions, answer keys, and scoring against my source.</span></label>
      </> : null}
      {warnings.length > 0 && <details className="cbt-import-warnings"><summary>{warnings.length} import note{warnings.length === 1 ? '' : 's'}</summary><ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
      {error && <p className="cbt-import-error" role="alert">{error}</p>}
      <input hidden ref={keyInput} type="file" accept=".pdf,.tex,application/pdf,application/x-tex,text/x-tex" onChange={event => { const selected = event.target.files?.[0]; if (selected) void readKeyFile(selected); event.target.value = ''; }}/>
      <input hidden ref={file} type="file" accept=".pdf,.tex,application/pdf,application/x-tex,text/x-tex" onChange={event => { const selected = event.target.files?.[0]; if (selected) void readFile(selected); event.target.value = ''; }} />
    </div>
  </div><footer className="modal-footer cbt-import-footer">{step === 'review' ? <><button type="button" className="button secondary" onClick={() => { setStep('source'); setError(''); }}><ArrowLeft size={14} />Source & settings</button><button type="button" className="button primary" disabled={!canSave} onClick={save}>Create test<Check size={15} /></button></> : <><button type="button" className="button secondary" onClick={onClose}>Cancel</button>{questions.length > 0 && <button type="button" className="button secondary" disabled={!!progress} onClick={() => setStep('review')}>Previous draft</button>}<button type="button" className="button primary" disabled={!source.trim() || !!progress || !!keyProgress || vaultReading} onClick={parse}>Parse questions<ArrowRight size={15} /></button></>}</footer></Modal>;
}
