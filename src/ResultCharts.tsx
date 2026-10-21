import { useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { Atom, BookOpen, Calculator, CheckCheck, FlaskConical, Info } from 'lucide-react';
import type { AnalysisGroup, QuestionAnalysis, TestAnalysis as Analysis, TestAttempt } from './testing-model';
import { getDifficultyGroups, getErrorOptimization, getTimeJourney, getTimeQuality } from './result-metrics';
import { duration, gsap, useGSAP } from './ui';
import './result-charts.css';

const CORRECT = '#12A447';
const INCORRECT = '#FA4148';
const UNANSWERED = '#64748B';
const ACCENT = 'var(--accent, #6A43FF)';
const SUBJECT_COLORS = ['#30B448', '#FF8A2A', '#0788FF', '#A76AD6', '#15A8AA', '#E4AD2B', '#E06196', '#64748B'];
const num = (value: number) => Number(value.toFixed(2)).toLocaleString('en-IN');
const percent = (value: number) => `${num(value)}%`;
const time = (seconds: number) => seconds < 60 ? `${num(seconds)} sec` : `${num(seconds / 60)} min`;
const short = (name: string, limit = 15) => name.length > limit ? `${name.slice(0, limit - 1)}…` : name;
const subjectColor = (index: number) => SUBJECT_COLORS[index % SUBJECT_COLORS.length];

function SubjectIcon({ name, overall = false }: { name: string; overall?: boolean }) {
  const Icon = overall ? CheckCheck : /phys/i.test(name) ? Atom : /chem/i.test(name) ? FlaskConical : /math/i.test(name) ? Calculator : BookOpen;
  return <Icon size={17} strokeWidth={1.7} aria-hidden="true" />;
}

function useChartMotion(ref: RefObject<HTMLDivElement | null>, key: string) {
  useGSAP((_context, contextSafe) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = ref.current;
    if (!root) return;
    let started = false;
    let observer: IntersectionObserver | null = null;
    const animate = contextSafe!(() => {
      if (started) return;
      started = true;
      observer?.disconnect();
      const bars = Array.from(root.querySelectorAll<SVGGraphicsElement | HTMLElement>('.rc-grow-y'));
      bars.forEach((bar, index) => gsap.fromTo(bar, { scaleY: 0 }, { scaleY: 1, duration: duration(.8), delay: index * .035, ease: 'expo.out', transformOrigin: bar.getAttribute('data-negative') === 'true' ? '50% 0%' : '50% 100%', clearProps: 'transform' }));
      const horizontal = root.querySelectorAll('.rc-grow-x');
      if (horizontal.length) gsap.fromTo(horizontal, { scaleX: 0 }, { scaleX: 1, duration: duration(.8), stagger: .035, ease: 'expo.out', transformOrigin: '0% 50%', clearProps: 'transform' });
      Array.from(root.querySelectorAll<SVGCircleElement>('.rc-pie-arc')).forEach((arc, index) => {
        const total = arc.dataset.total || '1';
        const length = arc.dataset.length || '0';
        gsap.fromTo(arc, { attr: { 'stroke-dasharray': `0 ${total}` } }, { attr: { 'stroke-dasharray': `${length} ${total}` }, duration: duration(.8), delay: index * .035, ease: 'expo.out' });
      });
    });
    const bounds = root.getBoundingClientRect();
    const visible = bounds.bottom > 0 && bounds.top < window.innerHeight && bounds.right > 0 && bounds.left < window.innerWidth;
    if (visible || !('IntersectionObserver' in window)) animate();
    else {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) animate(); }, { threshold: .05 });
      observer.observe(root);
    }
    return () => observer?.disconnect();
  }, { scope: ref, dependencies: [key], revertOnUpdate: true });
}

type Tip = { x: number; y: number; title: string; lines: { label: string; value: string; color?: string }[] };
function Tooltip({ tip }: { tip: Tip | null }) {
  return tip ? <div className="rc-tooltip" role="tooltip" style={{ left: `${Math.min(82, Math.max(18, tip.x))}%`, top: `${Math.min(90, Math.max(18, tip.y))}%` }}><strong>{tip.title}</strong>{tip.lines.map((line, index) => <span key={index}><i style={{ background: line.color || ACCENT }} /><span>{line.label}</span><b>{line.value}</b></span>)}</div> : null;
}

function SubjectTabs({ subjects, value, onChange, children }: { subjects: AnalysisGroup[]; value: string | null; onChange: (subject: string | null) => void; children: ReactNode }) {
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  useGSAP(() => { gsap.fromTo(content.current, { opacity: .35, y: 3 }, { opacity: 1, y: 0, duration: duration(.2), ease: 'power2.out', clearProps: 'opacity,transform' }); }, { scope: content, dependencies: [value], revertOnUpdate: true });
  const tabs = [{ name: 'Overall', value: null as string | null }, ...subjects.map(subject => ({ name: subject.name, value: subject.name }))];
  return <div className="rc-tab-card"><div className="rc-subject-tabs" role="tablist" aria-label="Choose analysis subject">{tabs.map((tab, index) => <button key={`${tab.value}-${index}`} id={`${id}-tab-${index}`} role="tab" aria-selected={value === tab.value} aria-controls={`${id}-panel`} tabIndex={value === tab.value ? 0 : -1} className={value === tab.value ? 'active' : ''} style={{ '--rc-subject': index ? subjectColor(index - 1) : ACCENT } as CSSProperties} onClick={() => onChange(tab.value)} onKeyDown={event => { if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; onChange(tabs[next].value); (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next])?.focus(); }}><SubjectIcon name={tab.name} overall={index === 0} /><span>{tab.name}</span></button>)}</div><div ref={content} role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tabs.findIndex(tab => tab.value === value)}`} className="rc-tab-content">{children}</div></div>;
}

type Series = { key: string; label: string; color: string };
type Group = { label: string; values: Record<string, number> };
const OUTCOMES: Series[] = [{ key: 'correct', label: 'Correct', color: CORRECT }, { key: 'incorrect', label: 'Incorrect', color: INCORRECT }, { key: 'unanswered', label: 'Unattempted', color: UNANSWERED }];
function Legend({ series, hidden, onToggle }: { series: Series[]; hidden?: Set<string>; onToggle?: (key: string) => void }) {
  return <div className="rc-chart-legend">{series.map(item => onToggle ? <button key={item.key} type="button" aria-pressed={!hidden?.has(item.key)} className={hidden?.has(item.key) ? 'is-hidden' : ''} onClick={() => onToggle(item.key)} title={`${hidden?.has(item.key) ? 'Show' : 'Hide'} ${item.label}`}><i style={{ background: item.color }} />{item.label}</button> : <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>;
}

function GroupedBars({ groups, series, title, hidden = new Set(), max, unit = '', compact = false }: { groups: Group[]; series: Series[]; title: string; hidden?: Set<string>; max?: number; unit?: string; compact?: boolean }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const visible = series.filter(item => !hidden.has(item.key));
  const W = compact ? 400 : 800, H = compact ? 300 : 310;
  const left = compact ? 43 : 55, right = 20, top = 22, bottom = compact ? 48 : 52;
  const width = W - left - right, height = H - top - bottom;
  const highest = Math.max(1, ...groups.flatMap(group => visible.map(item => group.values[item.key] || 0)));
  const step = max ? max / 4 : Math.max(1, Math.ceil(highest / 4));
  const ceiling = max || step * 4;
  const groupWidth = width / Math.max(1, groups.length);
  const barWidth = Math.min(compact ? 26 : 38, groupWidth * .65 / Math.max(1, visible.length));
  const gap = Math.min(7, barWidth * .25);
  const animationKey = JSON.stringify([groups, visible.map(item => item.key)]);
  useChartMotion(ref, animationKey);
  return <div ref={ref} className={`rc-svg-chart ${compact ? 'compact' : ''}`} onMouseLeave={() => setTip(null)}>
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={title}>
      {Array.from({ length: 5 }, (_, index) => { const y = top + height - index * height / 4; return <g key={index}><line x1={left} x2={W - right} y1={y} y2={y} className="rc-gridline" /><text x={left - 8} y={y + 4} textAnchor="end" className="rc-axis-label">{num(index * ceiling / 4)}{unit}</text></g>; })}
      <line x1={left} x2={left} y1={top} y2={top + height} className="rc-axis-line" /><line x1={left} x2={W - right} y1={top + height} y2={top + height} className="rc-axis-line" />
      {groups.map((group, groupIndex) => {
        const center = left + groupWidth * (groupIndex + .5);
        const fullWidth = visible.length * barWidth + Math.max(0, visible.length - 1) * gap;
        return <g key={group.label}><line x1={center} x2={center} y1={top} y2={top + height} className="rc-gridline vertical" />{visible.map((item, seriesIndex) => {
          const value = group.values[item.key] || 0;
          const x = center - fullWidth / 2 + seriesIndex * (barWidth + gap), barHeight = value / ceiling * height, y = top + height - barHeight;
          const show = () => setTip({ x: (x + barWidth / 2) / W * 100, y: Math.max(top + 50, y) / H * 100, title: group.label, lines: [{ label: item.label, value: `${num(value)}${unit || ' questions'}`, color: item.color }] });
          return <g key={item.key} tabIndex={0} role="img" aria-label={`${group.label}, ${item.label}: ${num(value)}${unit || ' questions'}`} className="rc-focus-mark" onFocus={show} onBlur={() => setTip(null)} onMouseEnter={show}><rect x={x - 4} y={top} width={barWidth + 8} height={height} fill="transparent" /><rect className="rc-grow-y rc-bar" x={x} y={y} width={barWidth} height={barHeight} rx={Math.min(4, barWidth / 5)} fill={item.color} /></g>;
        })}<text x={center} y={H - bottom + 19} textAnchor="middle" className="rc-axis-label"><title>{group.label}</title>{short(group.label, compact ? 14 : Math.max(10, 30 - groups.length))}</text></g>;
      })}
    </svg>
    {!visible.length && <div className="rc-all-hidden">Select a legend item to show it.</div>}
    <Tooltip tip={tip} />
  </div>;
}

export function TestBreakdown({ analysis }: { analysis: Analysis }) {
  const ref = useRef<HTMLDivElement>(null);
  const overall = { name: 'Overall', total: analysis.questionRows.length, correct: analysis.correct, incorrect: analysis.incorrect, unattempted: analysis.unattempted, notVisited: analysis.notVisited };
  const rows = [overall, ...analysis.subjects];
  const columns = [{ name: 'Correct attempts', key: 'correct', color: CORRECT }, { name: 'Incorrect attempts', key: 'incorrect', color: INCORRECT }, { name: 'Unattempted Qs', key: 'unanswered', color: ACCENT }, { name: 'Not visited Qs', key: 'notVisited', color: UNANSWERED }];
  useChartMotion(ref, JSON.stringify(rows));
  return <div className="rc-breakdown rc-table-scroll" ref={ref}><table><caption className="sr-only">Exclusive counts of correct, incorrect, visited but unanswered, and never visited questions.</caption><thead><tr><th scope="col"><span className="sr-only">Subject</span></th>{columns.map(column => <th scope="col" key={column.key}>{column.name}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${index}-${row.name}`}><th scope="row"><span style={{ color: index ? subjectColor(index - 1) : ACCENT }}><SubjectIcon name={row.name} overall={index === 0} /></span>{row.name}</th>{columns.map(column => { const value = column.key === 'unanswered' ? Math.max(0, row.unattempted - row.notVisited) : row[column.key as 'correct' | 'incorrect' | 'notVisited']; return <td key={column.key} style={{ '--rc-cell-color': column.color } as CSSProperties}><span className="rc-cell-fill rc-grow-x" style={{ width: `${row.total ? value / row.total * 100 : 0}%` }} /><span className="rc-cell-value"><b>{value}</b><span>/ {row.total}</span></span></td>; })}</tr>)}</tbody></table><p className="rc-data-note">Unattempted means visited without an answer. Not visited is counted separately.</p></div>;
}

function SubjectLegend({ subjects, value, unit }: { subjects: AnalysisGroup[]; value: (subject: AnalysisGroup) => number; unit: 'time' | 'count' | 'percent' }) {
  return <div className="rc-subject-legend">{subjects.map((subject, index) => <div key={subject.name}><i style={{ background: subjectColor(index) }} /><span>{subject.name}: <b>{unit === 'time' ? time(value(subject)) : unit === 'percent' ? percent(value(subject)) : `${num(value(subject))} Qs`}</b></span></div>)}</div>;
}

function SubjectPie({ subjects }: { subjects: AnalysisGroup[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const total = subjects.reduce((sum, subject) => sum + subject.timeSeconds, 0);
  const r = 56, circumference = Math.PI * 2 * r;
  let offset = 0;
  useChartMotion(ref, JSON.stringify(subjects.map(subject => subject.timeSeconds)));
  return <div ref={ref} className="rc-svg-chart rc-pie-chart" onMouseLeave={() => setTip(null)}><svg viewBox="0 0 360 310" role="group" aria-label="Share of actual test time by subject">{total ? subjects.map((subject, index) => {
    const fraction = subject.timeSeconds / total;
    const start = offset;
    offset += fraction;
    if (!fraction) return null;
    const angle = (start + fraction / 2) * Math.PI * 2 - Math.PI / 2;
    const x = 180 + Math.cos(angle) * 73, y = 155 + Math.sin(angle) * 73;
    const show = () => setTip({ x: x / 360 * 100, y: y / 310 * 100, title: subject.name, lines: [{ label: 'Time spent', value: time(subject.timeSeconds), color: subjectColor(index) }, { label: 'Share of test time', value: percent(fraction * 100) }] });
    return <g key={subject.name} tabIndex={0} role="img" aria-label={`${subject.name}: ${time(subject.timeSeconds)}, ${percent(fraction * 100)} of test time`} className="rc-focus-mark" onFocus={show} onBlur={() => setTip(null)} onMouseEnter={show}><circle className="rc-pie-arc" cx={180} cy={155} r={r} fill="none" stroke={subjectColor(index)} strokeWidth={r * 2} strokeDasharray={`${fraction * circumference} ${circumference}`} strokeDashoffset={-start * circumference} transform="rotate(-90 180 155)" data-length={fraction * circumference} data-total={circumference} />{fraction >= .055 && <text x={x} y={y + 4} textAnchor="middle" className="rc-pie-label">{percent(fraction * 100)}</text>}</g>;
  }) : <g><circle cx={180} cy={155} r={101} fill="#F4F1FA" /><text x={180} y={153} textAnchor="middle" className="rc-empty-label">No time recorded</text><text x={180} y={173} textAnchor="middle" className="rc-axis-label">0 sec</text></g>}</svg><Tooltip tip={tip} /></div>;
}

function SubjectColumns({ subjects, metric, title }: { subjects: AnalysisGroup[]; metric: 'attempted' | 'accuracy'; title: string }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const max = metric === 'accuracy' ? 100 : Math.max(4, Math.ceil(Math.max(0, ...subjects.map(subject => subject.attempted)) / 4) * 4);
  const W = Math.max(360, subjects.length * 80), H = 310, left = 42, right = 15, top = 22, bottom = 48;
  const height = H - top - bottom, width = W - left - right;
  useChartMotion(ref, JSON.stringify(subjects.map(subject => subject[metric])));
  return <div className="rc-svg-chart rc-subject-columns" ref={ref} onMouseLeave={() => setTip(null)}><svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={title}>{Array.from({ length: 5 }, (_, index) => { const y = top + height - height * index / 4; return <g key={index}><line x1={left} x2={W - right} y1={y} y2={y} className="rc-gridline" /><text x={left - 7} y={y + 4} textAnchor="end" className="rc-axis-label">{num(max * index / 4)}</text></g>; })}<line x1={left} x2={left} y1={top} y2={top + height} className="rc-axis-line" /><line x1={left} x2={W - right} y1={top + height} y2={top + height} className="rc-axis-line" />{subjects.map((subject, index) => { const x = left + width / subjects.length * (index + .5), value = subject[metric], barHeight = value / max * height, y = top + height - barHeight, barWidth = Math.min(30, width / subjects.length * .35); const show = () => setTip({ x: x / W * 100, y: Math.max(55, y) / H * 100, title: subject.name, lines: [{ label: metric === 'accuracy' ? 'Accuracy' : 'Attempted', value: metric === 'accuracy' ? percent(value) : `${value} questions`, color: subjectColor(index) }, ...(metric === 'accuracy' ? [{ label: 'Correct / attempted', value: `${subject.correct} / ${subject.attempted}` }] : [])] }); return <g key={subject.name} tabIndex={0} role="img" aria-label={`${subject.name}, ${metric === 'accuracy' ? `accuracy ${percent(value)}` : `${value} attempted questions`}`} className="rc-focus-mark" onFocus={show} onBlur={() => setTip(null)} onMouseEnter={show}><rect x={x - barWidth / 2 - 5} y={top} width={barWidth + 10} height={height} fill="transparent" /><rect x={x - barWidth / 2} y={y} width={barWidth} height={barHeight} rx={4} fill={subjectColor(index)} className="rc-grow-y rc-bar" /><text x={x} y={H - 26} textAnchor="middle" className="rc-axis-label"><title>{subject.name}</title>{short(subject.name, Math.max(8, 18 - subjects.length))}</text></g>; })}</svg><Tooltip tip={tip} /></div>;
}

export function SubjectTimeCharts({ analysis }: { analysis: Analysis }) {
  return <div className="rc-subject-chart-grid"><section><h3>Subject-wise Time Spent</h3><div className="rc-chart-card"><SubjectLegend subjects={analysis.subjects} value={subject => subject.timeSeconds} unit="time" /><SubjectPie subjects={analysis.subjects} /></div></section><section><h3>Subject-wise Questions Attempted</h3><div className="rc-chart-card"><SubjectLegend subjects={analysis.subjects} value={subject => subject.attempted} unit="count" /><SubjectColumns subjects={analysis.subjects} metric="attempted" title="Number of questions attempted by subject" /></div></section><section><h3>Subject-wise Accuracy</h3><div className="rc-chart-card"><SubjectLegend subjects={analysis.subjects} value={subject => subject.accuracy} unit="percent" /><SubjectColumns subjects={analysis.subjects} metric="accuracy" title="Percentage of attempted questions answered correctly by subject" /></div></section></div>;
}

export function TimeQualityChart({ analysis }: { analysis: Analysis }) {
  const [subject, setSubject] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const rows = analysis.questionRows.filter(row => subject === null || row.question.subject === subject);
  const quality = getTimeQuality(rows);
  const ref = useRef<HTMLDivElement>(null);
  const segments = [{ key: 'correct', label: 'Time on Correct Qs', seconds: quality.correctSeconds, value: quality.correctPercent, color: CORRECT }, { key: 'incorrect', label: 'Time on Incorrect Qs', seconds: quality.incorrectSeconds, value: quality.incorrectPercent, color: INCORRECT }, { key: 'unanswered', label: 'Time on Unattempted Qs', seconds: quality.unansweredSeconds, value: quality.unansweredPercent, color: UNANSWERED }];
  useChartMotion(ref, `${subject}-${quality.totalSeconds}`);
  return <section className="rc-section" ref={ref}><h3>Quality of Time Spent</h3><p className="rc-description">See how much of your recorded time went to correctly answered, incorrectly answered, and unanswered questions.</p><SubjectTabs subjects={analysis.subjects} value={subject} onChange={value => { setSubject(value); setTip(null); }}><div className="rc-quality-legend"><span><i style={{ background: ACCENT }} />{subject || 'Overall'}: <b>{time(quality.totalSeconds)}</b></span>{segments.map(segment => <span key={segment.key}><i style={{ background: segment.color }} />{segment.label}: <b>{time(segment.seconds)}</b></span>)}</div><div className="rc-quality-wrap" onMouseLeave={() => setTip(null)}><div className="rc-quality-stack" aria-label={`Time distribution for ${subject || 'all subjects'}`}>{segments.map(segment => segment.value > 0 ? <button type="button" key={segment.key} className="rc-quality-segment rc-grow-x" style={{ width: `${segment.value}%`, background: segment.color }} aria-label={`${segment.label}: ${time(segment.seconds)}, ${percent(segment.value)}`} onFocus={() => setTip({ x: 50, y: 25, title: subject || 'Overall', lines: [{ label: segment.label, value: `${time(segment.seconds)} · ${percent(segment.value)}`, color: segment.color }] })} onBlur={() => setTip(null)} onMouseEnter={() => setTip({ x: 50, y: 25, title: subject || 'Overall', lines: [{ label: segment.label, value: `${time(segment.seconds)} · ${percent(segment.value)}`, color: segment.color }] })}>{segment.value >= 4 ? `${Math.round(segment.value)}%` : <span className="sr-only">{percent(segment.value)}</span>}</button> : null)}{quality.totalSeconds === 0 && <span className="rc-quality-empty">No time recorded for this selection</span>}</div><Tooltip tip={tip} /></div></SubjectTabs></section>;
}

export function TimeJourneyCharts({ attempt, analysis }: { attempt: TestAttempt; analysis: Analysis }) {
  const journey = getTimeJourney(attempt, analysis.questionRows, 30);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const series = [{ key: 'correct', label: 'Correct Attempts', color: CORRECT }, { key: 'incorrect', label: 'Incorrect Attempts', color: INCORRECT }, { key: 'total', label: 'Overall', color: ACCENT }];
  const answeredWithEvents = journey.reduce((sum, interval) => sum + interval.total, 0);
  return <section className="rc-section"><h3>Time Journey</h3><p className="rc-description">Follow your final correct and incorrect answers as the test progressed. Each answer is counted at its last saved answer time.</p><div className="rc-table-scroll rc-journey-table"><table><caption className="sr-only">Final answers grouped into 30-minute time intervals</caption><thead><tr><th scope="col">Time interval</th><th scope="col" style={{ color: CORRECT }}>Correct attempts</th><th scope="col" style={{ color: INCORRECT }}>Incorrect attempts</th><th scope="col" style={{ color: ACCENT }}>Overall</th></tr></thead><tbody>{journey.map(interval => <tr key={interval.label}><th scope="row">{interval.label}</th><td style={{ color: CORRECT }}>{interval.correct}<small> Qs</small></td><td style={{ color: INCORRECT }}>{interval.incorrect}<small> Qs</small></td><td style={{ color: ACCENT }}>{interval.total}<small> Qs</small></td></tr>)}</tbody></table></div>{answeredWithEvents < analysis.attempted && <p className="rc-data-note">{analysis.attempted - answeredWithEvents} final answers have no saved answer timestamp and are excluded from this chart.</p>}<h3 className="rc-subheading">Graphical View of Time Journey</h3><div className="rc-chart-card"><Legend series={series} hidden={hidden} onToggle={key => setHidden(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} /><GroupedBars title="Final correct and incorrect answers by time interval" groups={journey.map(interval => ({ label: interval.label, values: { correct: interval.correct, incorrect: interval.incorrect, total: interval.total } }))} series={series} hidden={hidden} /></div></section>;
}

export function DifficultyCharts({ analysis }: { analysis: Analysis }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState<string | null>(null);
  const selections = [{ name: 'Overall', rows: analysis.questionRows }, ...analysis.subjects.map(subject => ({ name: subject.name, rows: analysis.questionRows.filter(row => row.question.subject === subject.name) }))];
  const selectedGroups = getDifficultyGroups(analysis.questionRows.filter(row => subject === null || row.question.subject === subject));
  return <section className="rc-section rc-difficulty-section"><div className="rc-difficulty-table-tabs"><SubjectTabs subjects={analysis.subjects} value={subject} onChange={setSubject}><div className="rc-table-scroll rc-difficulty-table"><table><caption className="sr-only">Difficulty breakdown for {subject || 'all subjects'}</caption><thead><tr><th scope="col">Difficulty</th><th scope="col" style={{ color: CORRECT }}>Correct attempts</th><th scope="col" style={{ color: INCORRECT }}>Incorrect attempts</th><th scope="col">Unattempted</th></tr></thead><tbody>{selectedGroups.map(group => <tr key={group.name}><th scope="row">{group.name}<small> ({group.total} Qs)</small></th><td>{group.correct}</td><td>{group.incorrect}</td><td>{group.unattempted}</td></tr>)}</tbody></table></div></SubjectTabs></div><h3 className="rc-subheading">Graphical View of Difficulty Analysis</h3><div className="rc-chart-card rc-difficulty-card"><Legend series={OUTCOMES} hidden={hidden} onToggle={key => setHidden(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} /><div className="rc-difficulty-grid">{selections.map((selection, index) => <section key={`${index}-${selection.name}`}><GroupedBars compact title={`Difficulty analysis for ${selection.name}`} series={OUTCOMES} hidden={hidden} groups={getDifficultyGroups(selection.rows).map(group => ({ label: group.name, values: { correct: group.correct, incorrect: group.incorrect, unanswered: group.unattempted } }))} /><h4 style={{ color: index ? subjectColor(index - 1) : ACCENT }}><SubjectIcon name={selection.name} overall={index === 0} />{selection.name}</h4></section>)}</div></div></section>;
}

export function ErrorOptimizationChart({ analysis }: { analysis: Analysis }) {
  const [subject, setSubject] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, '');
  const rows: QuestionAnalysis[] = analysis.questionRows.filter(row => subject === null || row.question.subject === subject);
  const optimization = getErrorOptimization(rows);
  const W = 900, H = 330, left = 55, right = 25, top = 22, bottom = 52;
  const width = W - left - right, height = H - top - bottom;
  const high = Math.max(1, optimization.maxScore, ...optimization.scenarios.map(scenario => scenario.score));
  const low = Math.min(0, optimization.actualScore);
  const step = Math.max(.25, Math.ceil((high - low) / 4));
  const max = Math.ceil(high / step) * step, min = Math.floor(low / step) * step;
  const y = (value: number) => top + (max - value) / (max - min) * height;
  const zero = y(0);
  useChartMotion(ref, JSON.stringify([subject, optimization]));
  return <section className="rc-section" ref={ref}><h3>Score Improvement by Error Optimization</h3><p className="rc-description">A hypothetical answer-key calculation: recover 50% or 100% of the marks lost on incorrect answers, including their wrong-answer penalties. This is a scenario, not a performance prediction.</p><SubjectTabs subjects={analysis.subjects} value={subject} onChange={value => { setSubject(value); setTip(null); }}><Legend series={[{ key: 'actual', label: 'Actual score', color: ACCENT }, { key: 'improvement', label: 'Improved score by error reduction', color: '#BCA8FF' }]} /><div className="rc-svg-chart rc-optimization-chart" onMouseLeave={() => setTip(null)}><svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Hypothetical score improvement for ${subject || 'all subjects'}`}><defs><linearGradient id={`${id}-improvement`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent, #6A43FF)" stopOpacity=".65" /><stop offset="100%" stopColor="var(--accent, #6A43FF)" stopOpacity=".08" /></linearGradient></defs>{Array.from({ length: 5 }, (_, index) => { const value = min + (max - min) * index / 4, at = y(value); return <g key={index}><line x1={left} x2={W - right} y1={at} y2={at} className="rc-gridline" /><text x={left - 8} y={at + 4} textAnchor="end" className="rc-axis-label">{num(value)}</text></g>; })}<line x1={left} x2={left} y1={top} y2={top + height} className="rc-axis-line" /><line x1={left} x2={W - right} y1={zero} y2={zero} className="rc-axis-line" />{optimization.scenarios.map((scenario, index) => { const x = left + width / 3 * (index + .5), actualY = y(optimization.actualScore), improvedY = y(scenario.score), barWidth = 49; const show = () => setTip({ x: x / W * 100, y: Math.max(60, Math.min(actualY, improvedY)) / H * 100, title: scenario.label, lines: [{ label: 'Actual score', value: num(optimization.actualScore), color: ACCENT }, { label: 'Recovered marks', value: `+${num(scenario.improvement)}`, color: '#A38BE8' }, { label: 'Scenario score', value: `${num(scenario.score)} / ${num(optimization.maxScore)}` }] }); return <g key={scenario.label} tabIndex={0} role="img" aria-label={`${scenario.label}: actual score ${num(optimization.actualScore)}, recovered marks ${num(scenario.improvement)}, scenario score ${num(scenario.score)} out of ${num(optimization.maxScore)}`} className="rc-focus-mark" onFocus={show} onBlur={() => setTip(null)} onMouseEnter={show}><line x1={x} x2={x} y1={top} y2={top + height} className="rc-gridline vertical" /><rect x={x - barWidth / 2 - 7} y={top} width={barWidth + 14} height={height} fill="transparent" /><rect x={x - barWidth / 2} y={Math.min(zero, actualY)} width={barWidth} height={Math.abs(actualY - zero)} fill={ACCENT} className="rc-grow-y rc-bar" data-negative={optimization.actualScore < 0} /><rect x={x - barWidth / 2} y={Math.min(actualY, improvedY)} width={barWidth} height={Math.abs(improvedY - actualY)} fill={`url(#${id}-improvement)`} className="rc-grow-y" /><text x={x} y={H - 25} textAnchor="middle" className="rc-axis-label">{scenario.label}</text></g>; })}</svg><Tooltip tip={tip} /></div></SubjectTabs><p className="rc-data-note"><Info size={13} />Correct and unanswered questions are held constant. Only marks lost from the actual incorrect answers are recovered.</p></section>;
}
