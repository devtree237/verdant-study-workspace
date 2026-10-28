import { useId, useRef, useState } from 'react';
import type { DragEvent, PointerEvent, ReactNode } from 'react';
import { CalendarDays, Check, CheckCheck, ChevronDown, ClipboardList, Clock3, FileText, GripVertical, Layers3, MessageSquarePlus, Timer, X } from 'lucide-react';
import type { ChatContextSnapshot } from './chat-api';
import type { ChatTaskCard } from './chat-task-cards';
import { parseChatTaskSnapshot } from './chat-task-cards';
import { gsap, useGSAP, motion } from './ui';
import './chat-task-cards.css';

export type TaskSnapshotActions = {
  onAttach?: (task: ChatTaskCard) => void;
  onAddToBoard?: (task: ChatTaskCard) => void;
  onRemove?: (task: ChatTaskCard) => void;
  /** The parent resolves the saved record and writes the validated, identity-only payload. */
  onDragStart?: (event: DragEvent<HTMLElement>, task: ChatTaskCard) => void;
  /** Validate against current saved records; legacy snapshots may have no ID. */
  canUseTask?: (task: ChatTaskCard) => boolean;
  disabled?: boolean;
};
export type TaskSnapshotCardProps = TaskSnapshotActions & { task: ChatTaskCard; compact?: boolean; className?: string };

function formatDate(value: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function elapsed(value: number): string {
  if (value < 60) return `${Number(value.toFixed(1))} sec`;
  const hours = Math.floor(value / 3600), minutes = Math.floor((value % 3600) / 60), seconds = Math.floor(value % 60);
  return [hours ? `${hours} hr` : '', minutes ? `${minutes} min` : '', seconds ? `${seconds} sec` : ''].filter(Boolean).join(' ') || '0 sec';
}
function allowMotion() { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

/** A read-only snapshot; actions never edit the original task without a parent callback. */
export function TaskSnapshotCard({ task, onAttach, onAddToBoard, onRemove, onDragStart, canUseTask, compact = false, disabled = false, className = '' }: TaskSnapshotCardProps) {
  const root = useRef<HTMLElement>(null), titleId = useId(), [dragging, setDragging] = useState(false);
  const available = canUseTask ? canUseTask(task) : !!task.id;
  const canDrag = available && !!onDragStart && !disabled;
  const completed = task.done || task.stage === 'Completed';
  const status = completed ? 'Completed' : task.stage || 'Status not recorded';
  const hasDetails = !!task.notes || !!task.labels.length || !!task.subtasks.length;
  const { contextSafe } = useGSAP(() => {
    if (!allowMotion()) return;
    gsap.fromTo(root.current, { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: motion.state, ease: motion.easeOut, clearProps: 'opacity,transform' });
  }, { scope: root });
  const release = contextSafe(() => {
    if (root.current && allowMotion()) gsap.to(root.current, { scale: 1, rotation: 0, duration: motion.state, ease: motion.easeOut, clearProps: 'transform', overwrite: 'auto' });
  });
  const press = contextSafe((event: PointerEvent<HTMLElement>) => {
    if (!canDrag || event.button !== 0 || (event.target instanceof Element && event.target.closest('button,summary')) || !allowMotion()) return;
    gsap.to(root.current, { scale: .994, duration: motion.fast, ease: motion.easeSoft, overwrite: 'auto' });
  });
  const startDrag = contextSafe((event: DragEvent<HTMLElement>) => {
    if (!canDrag || (event.target instanceof Element && event.target.closest('button,summary'))) { event.preventDefault(); return; }
    onDragStart?.(event, task);
    if (event.defaultPrevented) { release(); return; }
    setDragging(true);
    if (allowMotion()) gsap.to(root.current, { scale: 1.015, rotation: .4, duration: motion.fast, overwrite: 'auto' });
  });
  return <article ref={root} className={`task-snapshot-card ${compact ? 'is-compact' : ''} ${dragging ? 'is-dragging' : ''} ${className}`} aria-labelledby={titleId} draggable={canDrag} onDragStart={startDrag} onDragEnd={() => { setDragging(false); release(); }} onPointerDown={press} onPointerUp={release} onPointerCancel={release} onPointerLeave={() => { if (!dragging) release(); }}>
    <div className="task-snapshot-topline"><span className={`task-snapshot-status ${completed ? 'is-completed' : ''}`}>{completed ? <CheckCheck size={12} aria-hidden="true" /> : <span aria-hidden="true" />}{status}</span><div className="task-snapshot-top-actions">{canDrag && <span className="task-snapshot-grip" title="Drag to the chat composer or board. You can also use the action buttons." aria-label="Draggable task"><GripVertical size={16} aria-hidden="true" /></span>}{onRemove && <button type="button" className="task-snapshot-remove" onClick={() => onRemove(task)} disabled={disabled} aria-label={`Remove ${task.title} from message`}><X size={14} /></button>}</div></div>
    <h4 id={titleId} className="task-snapshot-title">{task.title}</h4>
    <div className="task-snapshot-subject"><span aria-hidden="true" /><span>{task.subject || 'Unassigned'}</span>{task.priority !== null && <small>Priority {task.priority}</small>}</div>
    <dl className="task-snapshot-facts">
      {(completed || task.completedDate) && <div className="task-snapshot-date"><dt><Check size={12} aria-hidden="true" />Completed</dt><dd>{formatDate(task.completedDate)}</dd></div>}
      {task.due && <div className="task-snapshot-date"><dt><CalendarDays size={12} aria-hidden="true" />Due</dt><dd>{formatDate(task.due)}</dd></div>}
      <div><dt><Clock3 size={12} aria-hidden="true" />Planned</dt><dd>{task.plannedMinutes === null ? 'Not set' : `${task.plannedMinutes.toLocaleString('en-IN')} min`}<small>Estimate</small></dd></div>
      <div><dt><Timer size={12} aria-hidden="true" />Measured</dt><dd className={task.measuredSeconds === null ? 'is-unrecorded' : ''}>{task.measuredSeconds === null ? 'Not recorded' : elapsed(task.measuredSeconds)}</dd></div>
    </dl>
    {hasDetails && <details className="task-snapshot-details"><summary><span>Task details{task.subtasks.length ? ` · ${task.subtasks.filter(item => item.done).length}/${task.subtasks.length} subtasks` : ''}</span><ChevronDown size={13} aria-hidden="true" /></summary><div>{!!task.notes && <p className="task-snapshot-notes">{task.notes}</p>}{!!task.labels.length && <ul className="task-snapshot-labels" aria-label="Labels">{task.labels.map((label, index) => <li key={`${label}-${index}`}>@{label}</li>)}</ul>}{!!task.subtasks.length && <ul className="task-snapshot-subtasks" aria-label="Subtasks">{task.subtasks.map((item, index) => <li key={index}><span className={item.done ? 'is-done' : ''} aria-label={item.done ? 'Completed' : 'Not completed'}>{item.done && <Check size={10} aria-hidden="true" />}</span><span>{item.title}</span></li>)}</ul>}</div></details>}
    {(onAttach || onAddToBoard) && <div className="task-snapshot-actions">{onAttach && <button type="button" onClick={() => onAttach(task)} disabled={disabled || !available}><MessageSquarePlus size={13} aria-hidden="true" />Attach to chat</button>}{onAddToBoard && <button type="button" onClick={() => onAddToBoard(task)} disabled={disabled || !available}><Layers3 size={13} aria-hidden="true" />Add to board</button>}</div>}
    {(onAttach || onAddToBoard) && !available && <p className="task-snapshot-legacy-note">{task.id ? 'This saved task is no longer available for actions.' : 'This earlier snapshot cannot be matched to one saved task.'} It remains available to read.</p>}
  </article>;
}

export function TaskSnapshotCards({ tasks, emptyText = 'No tasks are included in this snapshot.', compact, className = '', ...actions }: TaskSnapshotActions & { tasks: readonly ChatTaskCard[]; emptyText?: string; compact?: boolean; className?: string }) {
  if (!tasks.length) return <div className="task-snapshot-empty"><ClipboardList size={20} aria-hidden="true" /><p>{emptyText}</p></div>;
  return <div className={`task-snapshot-grid ${compact ? 'is-compact' : ''} ${className}`}>{tasks.map((task, index) => <TaskSnapshotCard key={`${task.id || 'snapshot'}-${index}`} task={task} compact={compact} {...actions} />)}</div>;
}

const fieldLabels: Record<string, string> = {
  id: 'Record ID', asOf: 'As of', recordedStudyStreakDays: 'Recorded study streak', streakDefinition: 'How the streak is counted', completedToday: 'Tasks completed today', focusLog: 'Focus records', assessments: 'Assessments', testResults: 'Test results', completedTasks: 'Completed tasks', tasks: 'Tasks', selectedDocuments: 'Selected documents', mistakes: 'Mistakes', plannedMinutes: 'Planned time', measuredSeconds: 'Measured time', recordedSeconds: 'Recorded time', recordedScore: 'Recorded score', accuracyPercent: 'Accuracy', submittedAt: 'Submitted', completedDate: 'Completed', wrongAnswer: 'Recorded answer', reviewDate: 'Review date', maximum: 'Maximum score', done: 'Completed', note: 'About this context', text: 'Document text', pages: 'Pages / sections', question: 'Question', score: 'Score', subject: 'Subject', subjects: 'Subject results', minutes: 'Focused time', date: 'Date', title: 'Title', notes: 'Notes', labels: 'Labels', subtasks: 'Subtasks', stage: 'Status', priority: 'Priority', due: 'Due', attempts: 'Review attempts', status: 'Status', category: 'Category', topic: 'Topic', solution: 'Solution', takeaway: 'Takeaway', attempted: 'Attempted', correct: 'Correct', name: 'Name', kind: 'Record type', version: 'Snapshot version', task: 'Task', taskCards: 'Tasks',
};
const fieldName = (key: string) => fieldLabels[key] || key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, letter => letter.toUpperCase());
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function scalar(value: unknown, field = ''): ReactNode {
  if (value === null || value === undefined) return <span className="context-not-recorded">Not recorded</span>;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (field === 'submittedAt' && Number.isFinite(value)) return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (/Seconds$/.test(field)) return elapsed(value);
    if (field === 'minutes' || field === 'plannedMinutes') return `${value.toLocaleString('en-IN')} min`;
    if (/Percent$/.test(field)) return `${value.toLocaleString('en-IN')}%`;
    if (field === 'recordedStudyStreakDays') return `${value.toLocaleString('en-IN')} days`;
    return value.toLocaleString('en-IN');
  }
  if (typeof value === 'string') return value || <span className="context-not-recorded">Not provided</span>;
  return String(value);
}

/** Natural field labels keep every selected value readable without exposing JSON syntax. */
function ReadableFields({ value, field = '' }: { value: unknown; field?: string }) {
  if (Array.isArray(value)) {
    if (!value.length) return <p className="context-no-records">No records included.</p>;
    return <div className={`context-readable-list ${value.every(item => !isObject(item) && !Array.isArray(item)) ? 'is-simple' : ''}`}>{value.map((item, index) => <div className="context-readable-record" key={index}><ReadableFields value={item} field={field} /></div>)}</div>;
  }
  if (!isObject(value)) return <div className={`context-readable-text ${field === 'text' ? 'is-document-text' : ''}`}>{scalar(value, field)}</div>;
  return <dl className="context-readable-fields">{Object.entries(value).map(([key, item]) => <div key={key} className={isObject(item) || Array.isArray(item) ? 'is-nested' : ''}><dt>{fieldName(key)}</dt><dd><ReadableFields value={item} field={key} /></dd></div>)}</dl>;
}

function ContextDocuments({ documents }: { documents: readonly unknown[] }) {
  return <div className="context-selected-documents">{documents.length ? documents.map((document, index) => <details key={index} className="context-document"><summary><FileText size={15} aria-hidden="true" /><span>{isObject(document) && typeof document.title === 'string' ? document.title : `Document ${index + 1}`}<small>{isObject(document) && typeof document.pages === 'number' ? `${document.pages} pages / sections · ` : ''}Full selected text</small></span><ChevronDown size={14} aria-hidden="true" /></summary><div><ReadableFields value={isObject(document) ? Object.fromEntries(Object.entries(document).filter(([key]) => key !== 'title')) : document} /></div></details>) : <p className="context-no-records">No Vault documents selected.</p>}</div>;
}

function ContextRecordSection({ name, records }: { name: string; records: readonly unknown[] }) {
  return <details className="context-record-section"><summary><span>{name}<small>{records.length.toLocaleString('en-IN')} {records.length === 1 ? 'record' : 'records'}</small></span><ChevronDown size={14} aria-hidden="true" /></summary><div><ReadableFields value={records} /></div></details>;
}

export type ChatContextViewProps = {
  contexts: readonly ChatContextSnapshot[];
  onAttachTask?: TaskSnapshotActions['onAttach'];
  onAddTaskToBoard?: TaskSnapshotActions['onAddToBoard'];
  onTaskDragStart?: TaskSnapshotActions['onDragStart'];
  canUseTask?: TaskSnapshotActions['canUseTask'];
  disabled?: boolean;
  emptyText?: string;
};

/** Renders the exact selected snapshot. Opening a document never reads another file. */
export function ChatContextView({ contexts, onAttachTask, onAddTaskToBoard, onTaskDragStart, canUseTask, disabled, emptyText = 'No workspace context is selected.' }: ChatContextViewProps) {
  if (!contexts.length) return <div className="task-snapshot-empty"><ClipboardList size={20} aria-hidden="true" /><p>{emptyText}</p></div>;
  return <div className="chat-context-cards">{contexts.map((context, index) => {
    const snapshot = parseChatTaskSnapshot(context);
    let original: unknown; try { original = JSON.parse(context.text); } catch { original = context.text; }
    const fields = isObject(original) ? original : null;
    const shown = new Set<string>(snapshot ? ['tasks', 'completedTasks', 'task'] : []);
    if (snapshot?.kind === 'task' && fields && !Object.hasOwn(fields, 'task')) {
      for (const key of ['id', 'title', 'subject', 'stage', 'done', 'due', 'completedDate', 'completedAt', 'plannedMinutes', 'duration', 'measuredSeconds', 'priority', 'notes', 'labels', 'subtasks']) shown.add(key);
    }
    const collectionKeys = ['focusLog', 'assessments', 'testResults', 'mistakes'].filter(key => Array.isArray(fields?.[key]));
    collectionKeys.forEach(key => shown.add(key));
    if (Array.isArray(fields?.selectedDocuments)) shown.add('selectedDocuments');
    const metrics: { label: string; value: string }[] = [];
    if (snapshot?.recordedStudyStreakDays !== undefined) { metrics.push({ label: 'Recorded streak', value: `${snapshot.recordedStudyStreakDays} days` }); shown.add('recordedStudyStreakDays'); }
    if (snapshot?.completedToday !== undefined) { metrics.push({ label: 'Completed today', value: String(snapshot.completedToday) }); shown.add('completedToday'); }
    if (Array.isArray(fields?.focusLog)) {
      const minutes = fields.focusLog.reduce<number>((sum, entry) => sum + (isObject(entry) && typeof entry.minutes === 'number' && Number.isFinite(entry.minutes) ? entry.minutes : 0), 0);
      const allRecorded = fields.focusLog.every(entry => isObject(entry) && typeof entry.minutes === 'number' && Number.isFinite(entry.minutes));
      metrics.push({ label: allRecorded && fields.focusLog.length ? 'Focused time' : 'Focus records', value: allRecorded && fields.focusLog.length ? `${minutes.toLocaleString('en-IN')} min` : `${fields.focusLog.length} records` });
    }
    if (Array.isArray(fields?.assessments)) metrics.push({ label: 'Assessments', value: String(fields.assessments.length) });
    if (Array.isArray(fields?.testResults)) metrics.push({ label: 'Submitted tests', value: String(fields.testResults.length) });
    const remaining = fields ? Object.fromEntries(Object.entries(fields).filter(([key]) => !shown.has(key))) : original;
    return <section className="context-snapshot-section" key={`${context.id}-${index}`}>
      <header><span className="context-snapshot-icon"><ClipboardList size={16} aria-hidden="true" /></span><div><h3>{context.label}</h3><p>{snapshot ? `${snapshot.tasks.length.toLocaleString('en-IN')} ${snapshot.tasks.length === 1 ? 'task' : 'tasks'}${snapshot.asOf ? ` · ${formatDate(snapshot.asOf)}` : ''}` : 'Explicitly selected study context'}</p></div><span className="context-snapshot-label">Shared snapshot</span></header>
      {!!metrics.length && <dl className="context-snapshot-metrics">{metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>}
      {snapshot && <TaskSnapshotCards tasks={snapshot.tasks} onAttach={onAttachTask} onAddToBoard={onAddTaskToBoard} onDragStart={onTaskDragStart} canUseTask={canUseTask} disabled={disabled} emptyText={snapshot.kind === 'history' ? 'No completed tasks are included in this history snapshot.' : 'No tasks are included in this snapshot.'} />}
      {collectionKeys.map(key => <ContextRecordSection key={key} name={fieldName(key)} records={fields![key] as unknown[]} />)}
      {fields && Array.isArray(fields.selectedDocuments) && <div className="context-documents-section"><h4>Selected Vault documents</h4><ContextDocuments documents={fields.selectedDocuments} /></div>}
      {(!fields || Object.keys(remaining as object).length > 0) && <div className="context-snapshot-about"><ReadableFields value={remaining} /></div>}
      {snapshot && <details className="context-all-fields"><summary><span>All shared fields</span><ChevronDown size={13} aria-hidden="true" /></summary><div><ReadableFields value={original} /></div></details>}
    </section>;
  })}</div>;
}

export default TaskSnapshotCard;
