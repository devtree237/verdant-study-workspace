import { useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Check, CheckCheck, Clock3, Info, UserRound, UsersRound, X } from 'lucide-react';
import type { CohortRecord, TestAnalysis as Analysis, TestAttempt } from './testing-model';
import { AnimatedLineGraph } from './AnimatedLineGraph';
import { SubjectTabs, useChartMotion } from './ResultCharts';
import { SmoothSelect } from './components/ui/SmoothSelect';
import { getHourlyComparison, getTimeComparisonRows } from './time-analysis-metrics';
import type { HourlyComparisonRow, TimeComparisonRow, TimeOutcome } from './time-analysis-metrics';
import './time-analysis.css';

const number = (value: number) => Number(value.toFixed(2)).toLocaleString('en-IN');
const time = (seconds: number | null) => seconds === null ? 'Not supplied' : seconds < 60 ? `${number(seconds)} sec` : `${number(seconds / 60)} min`;
const COLORS: Record<string, string> = { you: 'var(--accent,#6a43ff)', topper: '#12a447', top10: '#0788ff', top25: '#d19a16' };
const OUTCOMES: { key: TimeOutcome; label: string; Icon: typeof Check }[] = [{ key: 'total', label: 'Overall', Icon: CheckCheck }, { key: 'correct', label: 'Correct', Icon: Check }, { key: 'incorrect', label: 'Incorrect', Icon: X }];
const coverage = (row: TimeComparisonRow | HourlyComparisonRow) => row.key === 'you' ? 'This recorded attempt' : `${row.included} of ${row.members} result${row.members === 1 ? '' : 's'} supplied`;

function OutcomeTabs({ value, onChange, panelId, label }: { value: TimeOutcome; onChange: (value: TimeOutcome) => void; panelId: string; label: string }) {
  const change = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? OUTCOMES.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + OUTCOMES.length) % OUTCOMES.length;
    onChange(OUTCOMES[next].key); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  };
  return <div className="ta-outcome-tabs" role="tablist" aria-label={label}>{OUTCOMES.map(({ key, label, Icon }, index) => <button type="button" id={`${panelId}-${key}`} role="tab" aria-selected={key === value} aria-controls={panelId} tabIndex={key === value ? 0 : -1} className={key === value ? 'active' : ''} key={key} onClick={() => onChange(key)} onKeyDown={event => change(event, index)}><Icon size={16} aria-hidden="true" />{label}</button>)}</div>;
}
function Person({ row }: { row: TimeComparisonRow | HourlyComparisonRow }) {
  const Icon = row.key === 'you' ? UserRound : UsersRound;
  return <span className="ta-person"><Icon size={17} aria-hidden="true" /><span><b>{row.label}</b><small>{coverage(row)}</small></span></span>;
}
function PercentCell({ value, tone }: { value: number | null; tone: 'attempt' | 'accuracy' }) {
  return <td className={`ta-percent-cell ${tone}`}><span className="ta-percent-fill rc-grow-x" aria-hidden="true" style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} /><b>{value === null ? <span className="ta-not-supplied">Not supplied</span> : `${number(value)}%`}</b></td>;
}

export function TimeAnalysis({ attempt, analysis, cohort, onImport }: { attempt: TestAttempt; analysis: Analysis; cohort: CohortRecord[]; onImport?: () => void }) {
  const [subject, setSubject] = useState<string | null>(null);
  const [tableOutcome, setTableOutcome] = useState<TimeOutcome>('total'), [graphOutcome, setGraphOutcome] = useState<TimeOutcome>('correct');
  const [intervalMinutes, setIntervalMinutes] = useState(attempt.paper.durationMinutes <= 10 ? 1 : attempt.paper.durationMinutes <= 30 ? 5 : attempt.paper.durationMinutes <= 60 ? 15 : 60);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null), tableId = useId(), graphId = useId();
  const timeRows = useMemo(() => getTimeComparisonRows(attempt, analysis, cohort, subject), [attempt, analysis, cohort, subject]);
  const table = useMemo(() => getHourlyComparison(attempt, analysis, cohort, tableOutcome, intervalMinutes), [attempt, analysis, cohort, tableOutcome, intervalMinutes]);
  const graph = useMemo(() => getHourlyComparison(attempt, analysis, cohort, graphOutcome, intervalMinutes), [attempt, analysis, cohort, graphOutcome, intervalMinutes]);
  const ownMissing = graph.rows[0].missingTimestamps;
  useChartMotion(root, JSON.stringify([subject, timeRows]));
  const comparisonNote = !cohort.length ? <p className="ta-source-note"><Info size={14} aria-hidden="true" /><span>Your own results work without a comparison group. {onImport ? <button type="button" onClick={onImport}>Import actual cohort results</button> : 'Import actual results in Comparative analysis'} to add Top 10% and Top 25% rows.</span></p> : <p className="ta-source-note"><Info size={14} aria-hidden="true" /><span>Peer rows show the mean of supplied results in the score-ranked imported cohort. Score ties are included at group boundaries. Subject metrics need complete question detail; hourly metrics also need every relevant final-answer timestamp.</span></p>;
  const intervalLabel = intervalMinutes === 60 ? 'Hour Wise Breakdown' : `${intervalMinutes}-Minute Breakdown`;
  return <div className="time-analysis-detail">
    <section className="ta-block ta-breakdown" aria-label="Time breakdown">
      <header className="ta-heading"><Clock3 size={17} aria-hidden="true" /><h3>Time Breakdown</h3></header>
      <div ref={root}><SubjectTabs subjects={analysis.subjects} value={subject} onChange={setSubject}>
        <div className="ta-table-scroll"><table className="ta-table"><caption className="sr-only">Recorded time, attempted-question percentage and accuracy for {subject || 'all subjects'}</caption><thead><tr><th scope="col">Students</th><th scope="col">Time spent</th><th scope="col">Qs attempted</th><th scope="col">Accuracy</th></tr></thead><tbody>{timeRows.filter(row => row.key !== 'topper').map(row => <tr key={row.key}><th scope="row"><Person row={row} /></th><td className={row.timeSeconds === null ? 'ta-not-supplied' : ''}>{time(row.timeSeconds)}</td><PercentCell value={row.attemptPercent} tone="attempt" /><PercentCell value={row.accuracyPercent} tone="accuracy" /></tr>)}</tbody></table></div>
      </SubjectTabs></div>
      <p className="ta-card-note">Qs attempted is the share of questions answered. Accuracy is the share of answered questions that were correct. Time is recorded work, not the paper’s time allowance.</p>
    </section>
    {comparisonNote}
    <section className="ta-block ta-hourly" aria-label={intervalLabel}>
      <header className="ta-heading"><h3>{intervalLabel}</h3><label>Group by<SmoothSelect aria-label="Hourly analysis interval" value={intervalMinutes} onChange={event => setIntervalMinutes(Number(event.target.value))}>{[1, 5, 15, 30, 60].map(minutes => <option value={minutes} key={minutes}>{minutes === 60 ? '1 hour' : `${minutes} min`}</option>)}</SmoothSelect></label></header>
      <OutcomeTabs value={tableOutcome} onChange={setTableOutcome} panelId={tableId} label="Hourly answer outcome" />
      <div id={tableId} role="tabpanel" aria-labelledby={`${tableId}-${tableOutcome}`} className="ta-table-scroll"><table className="ta-table ta-hourly-table"><caption className="sr-only">Final {tableOutcome === 'total' ? 'correct and incorrect' : tableOutcome} answers counted in recorded time intervals</caption><thead><tr><th scope="col">Students</th>{table.bins.map((bin, index) => <th scope="col" key={bin.label}><span>{intervalMinutes === 60 ? `Hour ${index + 1}` : `Interval ${index + 1}`}</span><small>{bin.label}</small></th>)}</tr></thead><tbody>{table.rows.filter(row => row.key !== 'topper').map(row => <tr key={row.key}><th scope="row"><Person row={row} /></th>{table.bins.map((bin, index) => <td key={bin.label}>{row.counts ? <><b>{number(row.counts[index])}</b><small> Qs</small></> : <span className="ta-not-supplied">Not supplied</span>}</td>)}</tr>)}</tbody></table></div>
      {table.rows[0].missingTimestamps > 0 && <p className="ta-card-note ta-missing" role="status"><Info size={14} aria-hidden="true" />{table.rows[0].missingTimestamps} of your final {tableOutcome === 'total' ? 'answers' : `${tableOutcome} answers`} have no valid saved answer timestamp. Their intervals cannot be reconstructed from total time.</p>}
    </section>
    <section className="ta-block ta-graph" aria-label="Graphical hourly breakdown">
      <header className="ta-heading"><h3>Graphical {intervalMinutes === 60 ? 'Hour-Wise' : 'Interval'} Breakdown</h3><span>Final answer counts</span></header>
      <OutcomeTabs value={graphOutcome} onChange={setGraphOutcome} panelId={graphId} label="Graph answer outcome" />
      <div id={graphId} role="tabpanel" aria-labelledby={`${graphId}-${graphOutcome}`} className="ta-graph-content">
        <div className="ta-series-legend" aria-label="Graph series">{graph.rows.map(row => <button key={row.key} type="button" aria-pressed={!hidden.has(row.key) && !!row.counts} disabled={!row.counts} className={hidden.has(row.key) || !row.counts ? 'is-hidden' : ''} style={{ '--ta-series': COLORS[row.key] } as CSSProperties} onClick={() => setHidden(current => { const next = new Set(current); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; })}><span className="ta-series-check" aria-hidden="true">{!hidden.has(row.key) && !!row.counts && <Check size={10} />}</span><span>{row.label}<small>{row.counts ? row.key === 'you' ? 'Your recorded answers' : `Mean of ${row.included}/${row.members} results` : 'Answer times not supplied'}</small></span></button>)}</div>
        <AnimatedLineGraph title={`Recorded ${graphOutcome === 'total' ? 'overall' : graphOutcome} answers by time interval`} groups={graph.bins.map((bin, index) => ({ label: bin.label, values: Object.fromEntries(graph.rows.map(row => [row.key, row.counts?.[index] ?? null])) }))} series={graph.rows.map(row => ({ key: row.key, label: row.label, color: COLORS[row.key] }))} hidden={hidden} emptyText={ownMissing ? 'Final-answer timestamps are missing. No interval values were guessed.' : 'No timed answer data is available for the selected series.'} />
        {graph.bins.length === 1 && <p className="ta-card-note">This selection contains one interval, shown as a point. Choose a shorter interval to see changes through the test.</p>}
        {ownMissing > 0 && <p className="ta-card-note ta-missing"><Info size={14} aria-hidden="true" />Your line is unavailable because {ownMissing} relevant final-answer timestamp{ownMissing === 1 ? ' is' : 's are'} missing. Choose another outcome to inspect the answers with complete history.</p>}
      </div>
    </section>
  </div>;
}
