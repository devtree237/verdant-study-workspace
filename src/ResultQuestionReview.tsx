import { BookOpen, Check, Flag, Plus, Search, X } from 'lucide-react';
import type { AnalysisGroup, QuestionAnalysis, QuestionResult } from './testing-model';
import { SmoothSelect } from './components/ui/SmoothSelect';
import { formatResultTime } from './result-metrics';
import './result-question-review.css';

export type QuestionReviewFilter = {
  subject: string;
  outcome: QuestionResult | 'all' | 'painful';
  search: string;
};

const outcomeLabel: Record<QuestionResult, string> = {
  correct: 'Correct',
  incorrect: 'Incorrect',
  unattempted: 'Unanswered',
  unvisited: 'Not visited',
};

const headers = ['Question', 'Chapter / topic', 'Difficulty', 'Time (spent / target)', 'Outcome', 'Evaluation', 'Marks'];

type Props = {
  rows: QuestionAnalysis[];
  questionNumbers: ReadonlyMap<string, number>;
  subjects: AnalysisGroup[];
  filter: QuestionReviewFilter;
  onFilter: (filter: QuestionReviewFilter) => void;
  onReview: (row: QuestionAnalysis) => void;
};

export function ResultQuestionReview({ rows, questionNumbers, subjects, filter, onFilter, onReview }: Props) {
  const query = filter.search.toLowerCase().trim();
  const searchTerms = query.split(/\s+/).filter(Boolean);
  const searchedNumber = /^q(?:uestion)?\s*(\d+)$/.exec(query);
  const visible = rows.filter(row => {
    const { id, subject, chapter, topic, prompt } = row.question;
    const questionNumber = questionNumbers.get(id);
    const text = `Q${questionNumber} Question ${questionNumber} ${subject} ${chapter} ${topic} ${prompt}`.toLowerCase();
    const matchesOutcome = filter.outcome === 'all' || row.status === filter.outcome
      || (filter.outcome === 'painful' && row.status === 'incorrect' && row.timeSeconds > row.idealSeconds);
    const matchesText = searchedNumber ? questionNumber === Number(searchedNumber[1]) : searchTerms.every(term => text.includes(term));
    return (!filter.subject || subject === filter.subject) && matchesOutcome && matchesText;
  });
  const correct = rows.filter(row => row.status === 'correct').length;
  const incorrect = rows.filter(row => row.status === 'incorrect').length;
  const filtering = !!(searchTerms.length || filter.subject || filter.outcome !== 'all');

  return <section className="analysis-panel result-question-review" aria-labelledby="result-question-review-title">
    <header className="result-question-heading">
      <div>
        <h2 id="result-question-review-title">Question by question</h2>
        <p>Open a question to see your response, the answer key, and the explanation.</p>
      </div>
      <div className="result-question-totals">
        {rows.length} {rows.length === 1 ? 'question' : 'questions'}
        <span aria-hidden="true">·</span><span>{correct} correct</span>
        <span aria-hidden="true">·</span><span>{incorrect} incorrect</span>
      </div>
    </header>

    <div className="result-question-controls">
      <div className="analysis-question-filters">
        <label className="analysis-search">
          <Search size={17} aria-hidden="true"/>
          <input type="search" aria-label="Search test questions" value={filter.search} placeholder="Search question, chapter, topic…"
            onChange={event => onFilter({ ...filter, search: event.target.value })}/>
        </label>
        <SmoothSelect aria-label="Analysis subject" value={filter.subject} onChange={event => onFilter({ ...filter, subject: event.target.value })}>
          <option value="">All subjects</option>
          {subjects.map(group => <option key={group.name} value={group.name}>{group.name}</option>)}
        </SmoothSelect>
        <SmoothSelect aria-label="Question outcome" value={filter.outcome} onChange={event => onFilter({ ...filter, outcome: event.target.value as QuestionReviewFilter['outcome'] })}>
          <option value="all">All outcomes</option>
          {Object.entries(outcomeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          <option value="painful">Incorrect over target</option>
        </SmoothSelect>
      </div>
      {visible.length > 0 && <div className="analysis-question-map" role="group" aria-label="Jump to question details">
        {visible.map(row => {
          const number = questionNumbers.get(row.question.id);
          return <button type="button" key={row.question.id} className={`outcome-${row.status}`} onClick={() => onReview(row)}
            aria-haspopup="dialog" aria-label={`Review question ${number}, ${outcomeLabel[row.status]}`} title={`${row.question.subject} · ${outcomeLabel[row.status]}`}>
            {number}{row.status === 'correct' && <Check size={13} aria-hidden="true"/>}
            {row.status === 'incorrect' && <X size={13} aria-hidden="true"/>}
          </button>;
        })}
      </div>}
    </div>
    {filtering && <p className="result-question-filter-count" role="status">{visible.length} of {rows.length} questions shown</p>}

    <div className="analysis-table-wrap result-question-table-wrap" role="region" aria-label="Question review table" tabIndex={0}>
      <table className="analysis-table result-question-table">
        <caption className="sr-only">Question outcomes, marks, and Mistake Book actions</caption>
        <thead><tr>
          {headers.map(label => <th key={label} scope="col">{label}</th>)}
          <th scope="col"><span className="sr-only">Mistake Book</span></th>
        </tr></thead>
        <tbody>
          {visible.map(row => {
            const { question } = row;
            const number = questionNumbers.get(question.id);
            const timeFill = row.idealSeconds > 0 ? Math.min(100, 100 * row.timeSeconds / row.idealSeconds) : 0;
            const score = Number(row.score.toFixed(2));
            return <tr key={question.id} data-outcome={row.status}>
              <th scope="row">
                <button type="button" className="result-question-number" onClick={() => onReview(row)} aria-haspopup="dialog"
                  aria-label={`Open question ${number}${row.response.markedReview ? ', marked for review' : ''}`}>
                  Q{number}{row.response.markedReview && <Flag size={12} aria-hidden="true"/>}
                </button>
              </th>
              <td><span className="result-question-chapter">{question.chapter || 'Uncategorized'}</span>{question.topic && <small>{question.topic}</small>}</td>
              <td><span className="result-question-difficulty" data-difficulty={question.difficulty}>{question.difficulty}</span></td>
              <td><div className="result-question-timing">
                <span>{formatResultTime(row.timeSeconds)} <span className="result-question-divider">/</span> {formatResultTime(row.idealSeconds)}</span>
                <span className="result-question-time-track" aria-hidden="true"><span style={{width: `${timeFill}%`}}/></span>
              </div></td>
              <td><span className="result-question-outcome">{outcomeLabel[row.status]}</span></td>
              <td>{row.timeCategory}</td>
              <td><strong className="result-question-marks" data-sign={Math.sign(score)}>{score > 0 ? '+' : ''}{score.toLocaleString()}</strong></td>
              <td><button type="button" className="button secondary result-question-capture" onClick={() => onReview(row)} aria-haspopup="dialog"
                aria-label={`Add question ${number} to Mistake Book`}>
                <Plus size={14} aria-hidden="true"/>Mistake Book
              </button></td>
            </tr>;
          })}
          {visible.length === 0 && <tr><td colSpan={8} className="result-question-empty">
            <BookOpen size={19} aria-hidden="true"/>
            <span>No questions match these filters.</span>
            <button type="button" className="text-link" onClick={() => onFilter({subject:'', outcome:'all', search:''})}>Clear filters</button>
          </td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
