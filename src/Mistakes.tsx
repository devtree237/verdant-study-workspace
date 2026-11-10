import { SmoothSelect } from './components/ui/SmoothSelect';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Search, ArrowRight, Eye, EyeOff, RotateCcw, Sparkles, CalendarPlus, Pencil, Trash2, ImagePlus, Star, Check, X, Plus, ChevronDown, ZoomIn, ImageOff, ArrowLeft, SlidersHorizontal } from 'lucide-react';
import type { Mistake } from './model';
import { categories, day, dateLabel, linkedTask, reviewResult, uid } from './model';
import { fileStore, useStore } from './store';
import { Empty, Markdown, Modal, gsap, useGSAP, Flip, duration } from './ui';
import { StudyIllustration } from './StudyIllustration';
import './mistake-book.css';

export function Attachment({ id, alt = 'Attached question or working' }: { id: string; alt?: string }) {
  const [url, setUrl] = useState(''), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true, objectUrl = '';
    setUrl(''); setLoading(true); setFailed(false); setExpanded(false);
    fileStore('get', id).then(blob => {
      if (!active) return;
      if (blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
      else setFailed(true);
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  if (loading) return <div className="mistake-media-placeholder" role="status"><ImagePlus size={18} aria-hidden="true" /><span>Loading question image…</span></div>;
  if (failed || !url) return <div className="mistake-media-placeholder is-unavailable"><ImageOff size={18} aria-hidden="true" /><span>The attachment is unavailable on this device. Edit this mistake to upload it again.</span></div>;
  return <><button type="button" className="mistake-media-frame" aria-label={`Expand image: ${alt}`} onClick={() => setExpanded(true)}><img className="mistake-attachment" src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} /><span className="mistake-image-expand"><ZoomIn size={15} aria-hidden="true" />Expand image</span></button>{expanded && createPortal(<Modal title="Question image" onClose={() => setExpanded(false)} wide><div className="modal-body mistake-image-zoom"><img src={url} alt={alt} /><p>Original uploaded image. Close this view to return to your review.</p></div></Modal>, document.body)}</>;
}

export function MistakeForm({ mistake, initial, onClose }: { mistake?: Mistake; initial?: Partial<Mistake>; onClose: () => void }) {
  const { data, update, notify } = useStore();
  const [title, setTitle] = useState(mistake?.title || initial?.title || ''), [subject, setSubject] = useState(mistake?.subject || initial?.subject || data.subjects[0]?.id || ''), [topic, setTopic] = useState(mistake?.topic || initial?.topic || '');
  const [category, setCategory] = useState(mistake?.category || initial?.category || 'Conceptual gap'), [prompt, setPrompt] = useState(mistake?.prompt || initial?.prompt || ''), [wrong, setWrong] = useState(mistake?.wrong || initial?.wrong || ''), [solution, setSolution] = useState(mistake?.solution || initial?.solution || ''), [takeaway, setTakeaway] = useState(mistake?.takeaway || initial?.takeaway || '');
  const [difficulty, setDifficulty] = useState(mistake?.difficulty || initial?.difficulty || 3), [file, setFile] = useState<File | null>(null), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !prompt.trim() || !solution.trim()) { setError('Add a title, question, and correct solution.'); return; }
    setSaving(true); let image = mistake?.image;
    try {
      if (file) { image = uid(); await fileStore('put', image, file); }
      const item: Mistake = { ...mistake, id: mistake?.id || uid(), title: title.trim(), subject, topic, category, prompt, wrong, solution, takeaway, difficulty, status: mistake?.status || 'Needs review', review: mistake?.review || day(), attempts: mistake?.attempts || 0, image };
      update(state => ({ ...state, mistakes: mistake ? state.mistakes.map(record => record.id === mistake.id ? { ...record, ...item } : record) : [item, ...state.mistakes] }));
      notify(mistake ? 'Mistake updated' : 'Mistake captured. A new chance to learn.'); onClose();
    } catch { setError('Could not save the attachment. Try a smaller image.'); setSaving(false); }
  }
  return <Modal title={mistake ? 'Edit mistake' : 'Turn a mistake into understanding'} onClose={onClose} wide><form onSubmit={save}><div className="modal-body space-y-4"><label>Title<input value={title} onChange={event => setTitle(event.target.value)} placeholder="What tripped you up?" required /></label><div className="form-grid"><label>Subject<SmoothSelect value={subject} onChange={event => setSubject(event.target.value)}>{!data.subjects.some(item => item.id === subject) && <option value={subject}>{subject ? 'Unavailable subject' : 'Unassigned'}</option>}{data.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SmoothSelect></label><label>Topic breadcrumb<input value={topic} onChange={event => setTopic(event.target.value)} placeholder="Electrostatics → Gauss’s law" /></label><label>Error category<SmoothSelect value={category} onChange={event => setCategory(event.target.value)}>{[...new Set([...categories, category])].map(item => <option key={item}>{item}</option>)}</SmoothSelect></label><label>Difficulty<div className="flex items-center gap-1 h-10">{[1, 2, 3, 4, 5].map(value => <button type="button" key={value} aria-label={`Difficulty ${value} of 5`} aria-pressed={difficulty === value} onClick={() => setDifficulty(value)} className={value <= difficulty ? 'text-amber-500' : 'text-slate-300'}><Star size={23} fill={value <= difficulty ? 'currentColor' : 'none'} /></button>)}</div></label></div><label>Question · Markdown & $LaTeX$ supported<textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} required placeholder="Write the original question…" /></label><label>My wrong approach<textarea value={wrong} onChange={event => setWrong(event.target.value)} rows={2} placeholder="What did you try? Where did it go wrong?" /></label><label>Correct step-by-step solution<textarea value={solution} onChange={event => setSolution(event.target.value)} rows={4} required placeholder="Explain the reasoning, one step at a time…" /></label><label>Key takeaway<input value={takeaway} onChange={event => setTakeaway(event.target.value)} placeholder="The one thing to remember next time" /></label><label className="upload-label"><ImagePlus size={18} /><span>{file ? file.name : 'Attach a question or screenshot'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const chosen = event.target.files?.[0]; if (chosen && (chosen.size > 10 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(chosen.type))) { setError('Choose a PNG, JPEG, or WebP image smaller than 10 MB.'); event.target.value = ''; return; } setFile(chosen || null); setError(''); }} /></label>{error && <p className="form-error" role="alert">{error}</p>}</div><footer className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : mistake ? 'Save changes' : 'Save mistake'}<ArrowRight size={15} /></button></footer></form></Modal>;
}

export function MistakeCard({ mistake, onEdit }: { mistake: Mistake; onEdit: (mistake: Mistake) => void }) {
  const { data, update, notify } = useStore(), ref = useRef<HTMLElement>(null), solutionId = useId(), scheduleId = useId();
  const [revealed, setRevealed] = useState(false), [scheduling, setScheduling] = useState(false), [scheduled, setScheduled] = useState(mistake.review), [scheduleError, setScheduleError] = useState('');
  const { contextSafe } = useGSAP({ scope: ref });
  const subject = data.subjects.find(item => item.id === mistake.subject);
  const sourceTitle = !!mistake.topic && /\b(?:question|q)\s*\d+\b/i.test(mistake.title);
  const subjectKind = subject?.name.toLowerCase().includes('chemistry') ? 'chemistry' : subject?.name.toLowerCase().includes('physics') ? 'physics' : '';
  const reveal = contextSafe(() => {
    flushSync(() => setRevealed(true));
    gsap.fromTo('.solution-body', { height: 0, opacity: 0, y: 4 }, { height: 'auto', opacity: 1, y: 0, duration: duration(.28), ease: 'power3.out', clearProps: 'height,opacity,transform' });
    gsap.fromTo('.assessment-choice', { y: 6, opacity: 0 }, { y: 0, opacity: 1, stagger: duration(.035), duration: duration(.2), ease: 'power3.out', clearProps: 'opacity,transform' });
  });
  function assess(rating: 'failed' | 'effort' | 'mastered') {
    update(state => { const current = state.mistakes.find(record => record.id === mistake.id); if (!current) return state; const followup = rating === 'failed' ? linkedTask(`Re-attempt: ${current.title}`, current.subject, 'mistake', current.id, day(), 1) : null; return { ...state, mistakes: state.mistakes.map(record => record.id === current.id ? reviewResult(record, rating) : record), tasks: followup ? [...state.tasks, followup] : state.tasks }; });
    setRevealed(false); notify(rating === 'failed' ? 'Review tomorrow. An urgent task was added for today.' : rating === 'effort' ? 'Good progress. Next review in 3 days.' : 'Mastered! We’ll revisit this in 14 days.');
  }
  function schedule() {
    const parsed = new Date(`${scheduled}T12:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled) || !Number.isFinite(parsed.getTime()) || day(0, parsed) !== scheduled) { setScheduleError('Choose a valid re-attempt date.'); return; }
    update(state => { const current = state.mistakes.find(record => record.id === mistake.id); if (!current) return state; return { ...state, tasks: [...state.tasks, linkedTask(`Re-attempt: ${current.title}`, current.subject, 'mistake', current.id, scheduled)], mistakes: state.mistakes.map(record => record.id === current.id ? { ...record, review: scheduled } : record) }; });
    setScheduling(false); setScheduleError(''); notify(`Re-attempt scheduled for ${dateLabel(scheduled)}`);
  }
  function remove() { update(state => ({ ...state, mistakes: state.mistakes.filter(record => record.id !== mistake.id) })); notify('Mistake deleted', () => update(state => state.mistakes.some(record => record.id === mistake.id) ? state : { ...state, mistakes: [...state.mistakes, mistake] })); }
  return <article className="mistake-card mistake-glass-card" ref={ref} data-flip-id={mistake.id}>
    <div className="mistake-card-meta"><div className="mistake-card-badges"><span className={`mistake-subject tone-${subject?.color || 'purple'}`} data-subject-kind={subjectKind}><span aria-hidden="true" />{subject?.name || (mistake.subject ? 'Unavailable subject' : 'Unassigned')}</span><span className="mistake-category">{mistake.category}</span></div><div className="mistake-card-actions"><button type="button" aria-label={`Edit ${mistake.title}`} onClick={() => onEdit(mistake)}><Pencil size={14} /></button><button type="button" aria-label={`Delete ${mistake.title}`} onClick={remove}><Trash2 size={14} /></button></div></div>
    <div className="mistake-card-heading">{sourceTitle && <p className="mistake-source">{mistake.title}</p>}<h2>{sourceTitle ? mistake.topic : mistake.title}</h2>{!sourceTitle && mistake.topic && <p className="mistake-topic">{mistake.topic}</p>}</div>
    <div className="mistake-question"><Markdown>{mistake.prompt}</Markdown></div>
    {mistake.image && <Attachment id={mistake.image} alt={`Question attachment for ${mistake.title}`} />}
    <details className="wrong-approach mistake-approach"><summary><Plus size={13} className="approach-plus" aria-hidden="true" /><span>My previous approach</span><ChevronDown size={12} className="approach-chevron" aria-hidden="true" /></summary><div><Markdown>{mistake.wrong || 'No previous approach recorded.'}</Markdown></div></details>
    {!revealed ? <div className="recall-cover mistake-recall"><div><StudyIllustration variant="mistakes" className="mistake-recall-art" size={66} /><span>Pause. Try it yourself first.<small>Recall before you reveal.</small></span></div><button type="button" className="mistake-reveal-button" onClick={reveal} aria-expanded={false} aria-controls={solutionId}>Reveal solution<Eye size={13} aria-hidden="true" /></button></div> : <div className="solution-body mistake-solution" id={solutionId}><div className="solution-content"><div className="mistake-solution-label"><Sparkles size={13} aria-hidden="true" /><span>The reasoning</span></div><Markdown>{mistake.solution}</Markdown>{mistake.takeaway && <div className="takeaway mistake-takeaway"><Sparkles size={15} aria-hidden="true" /><div><span>Keep this in mind</span><Markdown>{mistake.takeaway}</Markdown></div></div>}</div><p className="mistake-assessment-label">How did it go this time?</p><div className="assessment-actions"><button type="button" className="assessment-choice failed" onClick={() => assess('failed')}><RotateCcw size={14} /><span>Failed again<small>Review in 1 day</small></span></button><button type="button" className="assessment-choice effort" onClick={() => assess('effort')}><span>With effort<small>Review in 3 days</small></span></button><button type="button" className="assessment-choice mastered" onClick={() => assess('mastered')}><Check size={14} /><span>Mastered<small>Review in 14 days</small></span></button></div><button type="button" className="mistake-hide-solution" onClick={() => setRevealed(false)} aria-expanded={true} aria-controls={solutionId}><EyeOff size={12} />Hide solution</button></div>}
    <footer className="mistake-footer"><button type="button" className="mistake-schedule-trigger" onClick={() => { setScheduling(!scheduling); setScheduled(mistake.review || day()); setScheduleError(''); }} aria-expanded={scheduling} aria-controls={scheduleId}><CalendarPlus size={13} /><span>Schedule re-attempt</span></button></footer>
    {scheduling && <div className="schedule-inline mistake-schedule" id={scheduleId}><label>Re-attempt date<input aria-label="Re-attempt date" type="date" required value={scheduled} onInput={event => { setScheduled(event.currentTarget.value); setScheduleError(''); }} onChange={event => { setScheduled(event.target.value); setScheduleError(''); }} /></label><button type="button" className="mistake-schedule-save" disabled={!scheduled} onClick={schedule}>Schedule<Check size={13} /></button><button type="button" className="mistake-schedule-cancel" aria-label="Cancel scheduling" onClick={() => setScheduling(false)}><X size={15} /></button>{scheduleError && <p role="alert">{scheduleError}</p>}</div>}
  </article>;
}

const categoryLabels: Record<string, string> = { 'Conceptual gap': 'Conceptual', 'Formula misapplication': 'Formula', 'Calculation error': 'Calculation', 'Misread question': 'Misread', 'Time pressure': 'Time pressure' };
const shortCategory = (category: string) => categoryLabels[category] || category;
export function Mistakes({ search, onSearchChange, selectedId, clearSelection, onAdd: _onAdd, onEdit }: { search: string; onSearchChange?: (value: string) => void; selectedId?: string; clearSelection: () => void; onAdd: () => void; onEdit: (mistake: Mistake) => void }) {
  const { data } = useStore(), [subject, setSubject] = useState('all'), [category, setCategory] = useState('all'), [status, setStatus] = useState('all'), [localSearch, setLocalSearch] = useState(search);
  const ref = useRef<HTMLDivElement>(null), searchRef = useRef<HTMLInputElement>(null), { contextSafe } = useGSAP({ scope: ref });
  const query = onSearchChange ? search : localSearch;
  useEffect(() => setLocalSearch(search), [search]);
  useEffect(() => { const shortcut = (event: globalThis.KeyboardEvent) => { if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k' || document.querySelector('[role="dialog"],[role="listbox"]')) return; event.preventDefault(); event.stopPropagation(); searchRef.current?.focus(); searchRef.current?.select(); }; document.addEventListener('keydown', shortcut, true); return () => document.removeEventListener('keydown', shortcut, true); }, []);
  const change = contextSafe((fn: () => void) => { const state = Flip.getState(ref.current?.querySelectorAll('.mistake-card') || []); flushSync(fn); Flip.from(state, { duration: duration(.28), ease: 'power3.out', stagger: duration(.025), absolute: true, fade: true }); });
  const setQuery = (value: string) => { setLocalSearch(value); onSearchChange?.(value); };
  const allCategories = [...new Set([...categories, ...data.mistakes.map(mistake => mistake.category)])];
  const filtered = data.mistakes.filter(mistake => {
    const subjectName = data.subjects.find(item => item.id === mistake.subject)?.name || '';
    const matchesQuery = `${mistake.title} ${mistake.prompt} ${mistake.topic} ${mistake.category} ${mistake.takeaway} ${mistake.wrong} ${mistake.solution} ${subjectName}`.toLowerCase().includes(query.trim().toLowerCase());
    return (!selectedId || mistake.id === selectedId) && (subject === 'all' || mistake.subject === subject) && (category === 'all' || mistake.category === category) && (status === 'all' || (status === 'due' ? !!mistake.review && mistake.review <= day() : mistake.status === status)) && matchesQuery;
  });
  const due = data.mistakes.filter(mistake => !!mistake.review && mistake.review <= day()).length;
  const counts = allCategories.map((name, index) => ({ name, index, count: data.mistakes.filter(mistake => mistake.category === name).length }));
  const activeFilters = subject !== 'all' || category !== 'all' || status !== 'all' || !!query || !!selectedId;
  function clearFilters() { change(() => { setSubject('all'); setCategory('all'); setStatus('all'); setQuery(''); clearSelection(); }); }
  return <div className="mistake-book" ref={ref}>
    <div className="mistake-focus-overview">
      <div className="mistake-stat mistake-focus-stat"><span className="mistake-stat-label"><SlidersHorizontal size={11} />Where to focus</span><div className="mistake-distribution" aria-label="Error categories across all captured mistakes">{data.mistakes.length ? counts.filter(item => item.count > 0).map(item => <DistributionSegment key={item.name} count={item.count} total={data.mistakes.length} category={item.index} name={item.name} onClick={() => change(() => { setCategory(category === item.name ? 'all' : item.name); clearSelection(); })} active={category === item.name} />) : <span className="mistake-distribution-empty" />}</div><div className="mistake-distribution-legend">{counts.map(item => <button type="button" key={item.name} className={category === item.name ? 'active' : ''} aria-pressed={category === item.name} onClick={() => change(() => { setCategory(category === item.name ? 'all' : item.name); clearSelection(); })} title={`${item.name}: ${item.count} of ${data.mistakes.length}`}><i className={`error-tone-${item.index % 5}`} /><span><b>{Math.round(item.count / Math.max(data.mistakes.length, 1) * 100)}%</b> {shortCategory(item.name)}</span></button>)}</div></div>
    </div>
    <div className="learning-banner mistake-due-banner"><StudyIllustration variant="mistakes" className="mistake-banner-art" size={124} /><div><h2>{due ? `${due} ${due === 1 ? 'mistake is' : 'mistakes are'} due for review` : 'You’re up to date'}</h2><p>{due ? 'A fresh attempt turns a previous mistake into understanding.' : 'Your scheduled reviews will appear here when they’re due.'}</p></div><button type="button" className="mistake-review-due" disabled={!due} onClick={() => change(() => { setStatus('due'); setSubject('all'); setCategory('all'); setQuery(''); clearSelection(); })}>Review due cards<ArrowRight size={14} aria-hidden="true" /></button></div>
    <div className="mistake-toolbar"><div className="mistake-filter-group"><SmoothSelect aria-label="Filter mistakes by subject" value={subject} onChange={event => change(() => setSubject(event.target.value))}><option value="all">All subjects</option>{data.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</SmoothSelect><SmoothSelect aria-label="Filter by error category" value={category} onChange={event => change(() => setCategory(event.target.value))}><option value="all">All error categories</option>{allCategories.map(item => <option key={item}>{item}</option>)}</SmoothSelect><SmoothSelect aria-label="Filter by review status" value={status} onChange={event => change(() => setStatus(event.target.value))}><option value="all">All review statuses</option><option value="due">Due for review</option><option>Needs review</option><option>In progress</option><option>Mastered</option></SmoothSelect></div><label className="mistake-search"><Search size={14} aria-hidden="true" /><input ref={searchRef} aria-label="Search questions, tags, or concepts" placeholder="Search questions, tags, or concepts…" value={query} onChange={event => setQuery(event.target.value)} />{query ? <button type="button" aria-label="Clear mistake search" onClick={() => setQuery('')}><X size={12} /></button> : <kbd title="Command K or Control K">⌘K</kbd>}</label><span className="mistake-entry-count" role="status">{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span></div>
    {(activeFilters || selectedId) && <div className="mistake-filter-state">{selectedId ? <button type="button" onClick={clearSelection}><ArrowLeft size={12} />Back to all mistakes</button> : <span>Showing {filtered.length} of {data.mistakes.length} entries</span>}<button type="button" onClick={clearFilters}><X size={11} />Clear filters</button></div>}
    <div className="mistake-grid">{filtered.map(mistake => <MistakeCard key={mistake.id} mistake={mistake} onEdit={onEdit} />)}</div>
    {!filtered.length && <Empty illustration="mistakes" title={data.mistakes.length ? 'A little room to refocus' : 'A fresh page'} description={data.mistakes.length ? 'No questions match this view. Try a different subject, category, or search.' : 'Capture a question using Log mistake above. Your questions, reasoning, and review schedule will live here.'} action={activeFilters ? <button type="button" className="mistake-empty-reset" onClick={clearFilters}>Clear filters<RotateCcw size={13} /></button> : undefined} />}
  </div>;
}

function DistributionSegment({ count, total, category, name, onClick, active }: { count: number; total: number; category: number; name: string; onClick: () => void; active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(() => { gsap.fromTo(ref.current, { scaleX: 0 }, { scaleX: 1, duration: duration(.6), ease: 'expo.out' }); }, { scope: ref, dependencies: [count, total], revertOnUpdate: true });
  return <button type="button" className={`mistake-distribution-segment ${active ? 'active' : ''}`} style={{ flexGrow: count }} onClick={onClick} aria-pressed={active} aria-label={`${name}: ${count} mistakes, ${Math.round(count / total * 100)} percent. Filter this category.`} title={`${name}: ${count}`}><span ref={ref} className={`error-tone-${category % 5}`} /></button>;
}
