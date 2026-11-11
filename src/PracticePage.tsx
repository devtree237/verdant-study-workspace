import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, BookMarked, BookOpen, Check, ChevronLeft, ChevronRight, FileText, Search, X,
} from 'lucide-react';
import { PracticeChapterArt } from './PracticeChapterArt';
import type {
  PracticeChapter, PracticePageProps, PracticeProgressEntry, PracticeQuestion, PracticeSubject,
} from './practice-types';
import { Markdown } from './ui';
import './practice.css';

const subjects: PracticeSubject[] = ['Mathematics', 'Physics', 'Chemistry'];
const number = new Intl.NumberFormat('en-IN');
const countText = (count: number, noun: string) => `${number.format(count)} ${noun}${count === 1 ? '' : 's'}`;
const optionLetter = (index: number) => String.fromCharCode(65 + index);

type PracticeData = Pick<PracticePageProps,
  'loadQuestions' | 'progress' | 'onAnswer' | 'onPosition' | 'onSaveMistake' | 'isSaved' | 'onViewMistake' | 'savingMistakeId' | 'onOpenSource' | 'renderRegions'>;

function ProgressTrack({ done, total, label }: { done: number; total: number; label: string }) {
  return <progress className="practice-progress" value={Math.min(done, total)} max={Math.max(total, 1)} aria-label={label} />;
}

export function PracticePage({ chapters, resume, libraryControls, onOpenChapterSource, ...data }: PracticePageProps) {
  const [subject, setSubject] = useState<PracticeSubject>(() => chapters.find(chapter => chapter.id === resume?.chapterId)?.subject
    ?? subjects.find(name => chapters.some(chapter => chapter.subject === name)) ?? subjects[0]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const openChapter = chapters.find(chapter => chapter.id === active);
  const resumedChapter = chapters.find(chapter => chapter.id === resume?.chapterId && chapter.count > 0);
  const chapterHeading = useRef<HTMLHeadingElement>(null);
  const chapterButtons = useRef(new Map<string, HTMLButtonElement>());
  const lastOpened = useRef<string | null>(null);

  useEffect(() => {
    if (openChapter || !lastOpened.current) return;
    const returnTarget = chapterButtons.current.get(lastOpened.current) ?? chapterHeading.current;
    returnTarget?.focus();
    lastOpened.current = null;
  }, [openChapter]);

  const counts = new Map<string, number>();
  for (const entry of Object.values(data.progress)) {
    counts.set(entry.chapterId, (counts.get(entry.chapterId) ?? 0) + 1);
  }

  const subjectChapters = chapters.filter(chapter => chapter.subject === subject);
  const searchTerm = query.trim().toLocaleLowerCase();
  const matching = subjectChapters.filter(chapter => chapter.title.toLocaleLowerCase().includes(searchTerm));
  const groups = new Map<string, PracticeChapter[]>();
  for (const chapter of matching) {
    const key = chapter.level ?? '';
    const group = groups.get(key);
    if (group) group.push(chapter);
    else groups.set(key, [chapter]);
  }

  function selectChapter(chapter: PracticeChapter) {
    lastOpened.current = chapter.id;
    setActive(chapter.id);
  }

  if (openChapter) return <ChapterLoader key={openChapter.id} chapter={openChapter}
    startingIndex={resume?.chapterId === openChapter.id ? resume.questionIndex : null}
    onBack={() => setActive(null)} onOpenChapterSource={onOpenChapterSource} {...data} />;

  return <section className="practice-page" aria-labelledby="practice-title">
    <header className="practice-library-heading">
      <div>
        <h1 id="practice-title" ref={chapterHeading} tabIndex={-1}>Practise by chapter</h1>
        <p>JEE Advanced past questions from your PW books.</p>
      </div>
      {libraryControls}
    </header>

    {resumedChapter && <section className="practice-continue" aria-labelledby="practice-continue-title">
      <PracticeChapterArt chapter={resumedChapter} />
      <div className="practice-continue-copy">
        <p>Continue practising</p>
        <h2 id="practice-continue-title">{resumedChapter.title}</h2>
        <div className="practice-continue-progress">
          <ProgressTrack done={counts.get(resumedChapter.id) ?? 0} total={resumedChapter.count} label="Chapter progress" />
          <span>{Math.min(counts.get(resumedChapter.id) ?? 0, resumedChapter.count)} of {number.format(resumedChapter.count)} done</span>
        </div>
        <button className="practice-button practice-button-primary" type="button" onClick={() => selectChapter(resumedChapter)}>
          Continue <ArrowRight size={15} />
        </button>
      </div>
    </section>}

    <div className="practice-library-tools">
      <label className="practice-search">
        <Search size={17} aria-hidden="true" />
        <span className="sr-only">Search chapters</span>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search chapters" />
      </label>
      <div className="practice-subjects" role="group" aria-label="Practice subject">
        {subjects.map(name => <button key={name} type="button" aria-pressed={subject === name} onClick={() => setSubject(name)}>{name}</button>)}
      </div>
    </div>

    {!matching.length && <div className="practice-empty" role="status">
      <BookOpen size={22} aria-hidden="true" />
      <h2>{searchTerm ? 'No matching chapters' : `No ${subject} chapters available`}</h2>
      {searchTerm && <button type="button" className="practice-button" onClick={() => setQuery('')}>Clear search</button>}
    </div>}

    {[...groups].map(([level, group]) => <section className="practice-chapters" key={level}>
      <header>
        <h2>{level ? `${level} ${subject}` : subject}</h2>
        <span>{countText(group.length, 'chapter')}</span>
      </header>
      <div className="practice-chapter-grid">
        {group.map(chapter => {
          const done = Math.min(counts.get(chapter.id) ?? 0, chapter.count);
          return <button key={chapter.id} type="button" className="practice-chapter-card" onClick={() => selectChapter(chapter)}
            ref={button => {
              if (button) chapterButtons.current.set(chapter.id, button);
              else chapterButtons.current.delete(chapter.id);
            }}>
            <PracticeChapterArt chapter={chapter} />
            <span className="practice-card-copy">
              <strong>{chapter.title}</strong>
              <span className="practice-card-count">{countText(chapter.count, 'question')}{chapter.level && ` · ${chapter.level}`}</span>
              {done > 0 && <span className="practice-card-progress">
                <ProgressTrack done={done} total={chapter.count} label="Chapter progress" />
                <span>{number.format(done)} done</span>
              </span>}
            </span>
          </button>;
        })}
      </div>
    </section>)}
  </section>;
}

function ChapterLoader({ chapter, startingIndex, onBack, loadQuestions, onOpenChapterSource, ...data }: PracticeData & {
  chapter: PracticeChapter;
  startingIndex: number | null;
  onBack: () => void;
  onOpenChapterSource?: PracticePageProps['onOpenChapterSource'];
}) {
  const [questions, setQuestions] = useState<PracticeQuestion[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pageRange = chapter.startPage && (chapter.endPage && chapter.endPage > chapter.startPage
    ? `pages ${chapter.startPage}–${chapter.endPage}` : `page ${chapter.startPage}`);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (section.current && section.current.getBoundingClientRect().top < 0) {
      section.current.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }, []);

  useEffect(() => {
    let current = true;
    setQuestions(null);
    setError('');
    void loadQuestions(chapter).then(items => {
      if (current) setQuestions(items);
    }).catch((reason: unknown) => {
      if (current) setError(reason instanceof Error ? reason.message : 'This chapter could not load.');
    });
    return () => { current = false; };
  }, [chapter, loadQuestions, retry]);

  return <section className="practice-page practice-session" aria-labelledby="practice-chapter-title" ref={section}>
    <button className="practice-back" type="button" onClick={onBack}><ArrowLeft size={17} /> Practice</button>
    <header className="practice-session-heading">
      <PracticeChapterArt chapter={chapter} />
      <div>
        <h1 id="practice-chapter-title" tabIndex={-1} ref={heading}>{chapter.title}</h1>
        <p>{chapter.subject}{chapter.level && ` · ${chapter.level}`} · {countText(questions?.length ?? chapter.count, 'question')}</p>
        {onOpenChapterSource && chapter.startPage && <button className="practice-source-link practice-chapter-source" type="button" onClick={() => onOpenChapterSource(chapter)}>
          <FileText size={15} /> View chapter pages <span>({pageRange})</span>
        </button>}
      </div>
    </header>
    {error ? <div className="practice-empty" role="alert">
      <p>{error}</p>
      <button type="button" className="practice-button" onClick={() => setRetry(value => value + 1)}>Try again</button>
    </div> : !questions ? <div className="practice-empty" role="status">Loading questions…</div>
      : questions.length === 0 ? <div className="practice-empty" role="status">This chapter has no available questions.</div>
      : <ChapterSession chapter={chapter} questions={questions} startingIndex={startingIndex} {...data} />}
  </section>;
}

function ChapterSession({ chapter, questions, startingIndex, progress, onPosition, ...data }: Omit<PracticeData, 'loadQuestions'> & {
  chapter: PracticeChapter;
  questions: PracticeQuestion[];
  startingIndex: number | null;
}) {
  const [index, setIndex] = useState(() => startingIndex === null
    ? Math.max(0, questions.findIndex(question => !progress[question.id]))
    : Math.min(Math.max(0, startingIndex), questions.length - 1));
  const heading = useRef<HTMLHeadingElement>(null);
  const focusQuestion = useRef(false);
  const reportedPosition = useRef<number | null>(null);
  const question = questions[index];
  const bookNumber = question.label || (question.number !== undefined ? String(question.number) : '');
  const attempted = questions.filter(item => progress[item.id]);
  const correct = attempted.filter(item => progress[item.id].correct === true).length;
  const wrong = attempted.filter(item => progress[item.id].correct === false).length;
  const years = new Set(questions.flatMap(item => item.year === undefined ? [] : [item.year]));

  useEffect(() => {
    if (reportedPosition.current !== index) {
      reportedPosition.current = index;
      onPosition(chapter.id, index);
    }
    if (focusQuestion.current) {
      const target = heading.current;
      if (target) {
        target.focus({ preventScroll: true });
        const position = target.getBoundingClientRect();
        if (position.top < 12 || position.top > innerHeight * .7) target.scrollIntoView({ block: 'start', behavior: 'instant' });
      }
      focusQuestion.current = false;
    }
  }, [chapter.id, index, onPosition]);

  function jump(next: number) {
    if (next === index || next < 0 || next >= questions.length) return;
    focusQuestion.current = true;
    setIndex(next);
  }

  return <>
    <div className="practice-position">
      <ProgressTrack done={index + 1} total={questions.length} label="Current position in chapter" />
      <span>Question {number.format(index + 1)} of {number.format(questions.length)}</span>
    </div>
    <div className="practice-question-layout">
      <article className="practice-question" aria-labelledby="practice-question-number">
        <header className="practice-question-header">
          <h2 id="practice-question-number" ref={heading} tabIndex={-1}>Question {number.format(index + 1)}</h2>
          <span>{[question.source ?? chapter.source, question.year, question.page && `PDF page ${question.page}`,
            bookNumber && bookNumber !== String(index + 1) && `Book Q${bookNumber}`].filter(Boolean).join(' · ')}</span>
        </header>
        <QuestionAnswer key={question.id} chapter={chapter} question={question} entry={progress[question.id]} {...data} />
        <footer className="practice-question-navigation" aria-label="Question navigation">
          <button className="practice-button" type="button" disabled={index === 0} onClick={() => jump(index - 1)}><ChevronLeft size={17} /> Previous</button>
          <button className="practice-button practice-button-primary" type="button" disabled={index >= questions.length - 1} onClick={() => jump(index + 1)}>Next question <ChevronRight size={17} /></button>
        </footer>
      </article>

      <aside className="practice-question-sidebar" aria-label="Chapter progress">
        <section className="practice-side-card">
          <h2>This chapter</h2>
          <p>{attempted.length ? `${number.format(attempted.length)} done · ${number.format(correct)} correct` : 'No answers yet'}</p>
          <div className="practice-question-palette" aria-label="Jump to a question" role="group">
            {questions.map((item, itemIndex) => {
              const result = progress[item.id];
              const state = result ? result.correct === null ? 'reviewed' : result.correct ? 'correct' : 'incorrect' : 'unanswered';
              return <button type="button" key={item.id} aria-current={index === itemIndex ? 'step' : undefined}
                aria-label={`Question ${itemIndex + 1}, ${state}`} data-state={state} onClick={() => jump(itemIndex)}>{itemIndex + 1}</button>;
            })}
          </div>
          {attempted.length > 0 && <div className="practice-palette-legend">
            <span data-state="correct">{number.format(correct)} correct</span>
            {wrong > 0 && <span data-state="incorrect">{number.format(wrong)} incorrect</span>}
            {attempted.length > correct + wrong && <span data-state="reviewed">{number.format(attempted.length - correct - wrong)} reviewed</span>}
          </div>}
        </section>
        <section className="practice-side-card practice-chapter-facts" aria-label="Chapter details">
          {years.size > 0 && <div><strong>{countText(years.size, 'exam year')}</strong><span>Represented in this chapter</span></div>}
          <div><strong>{number.format(questions.length)}</strong><span>Past questions</span></div>
        </section>
      </aside>
    </div>
  </>;
}

function numericValue(value: string) {
  const parts = value.replace(/−/g, '-').trim().split(/\s*\/\s*/);
  if (parts.length > 2 || parts.some(part => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(part))) return NaN;
  const [numerator, denominator = 1] = parts.map(Number);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0 ? numerator / denominator : NaN;
}

function QuestionAnswer({ chapter, question, entry, onAnswer, onSaveMistake, isSaved, onViewMistake, savingMistakeId, onOpenSource, renderRegions }: Pick<PracticePageProps,
  'onAnswer' | 'onSaveMistake' | 'isSaved' | 'onViewMistake' | 'savingMistakeId' | 'onOpenSource' | 'renderRegions'> & {
  chapter: PracticeChapter;
  question: PracticeQuestion;
  entry?: PracticeProgressEntry;
}) {
  const [value, setValue] = useState<string | number[]>(entry?.value ?? (question.kind === 'numeric' ? '' : []));
  const [result, setResult] = useState(entry);
  const saved = isSaved?.(question.id) ?? false;
  const saving = savingMistakeId === question.id;
  const selected = Array.isArray(value) ? value : [];
  const choiceCount = Math.max(question.options?.length ?? 0, question.optionCount ?? 0);
  const choiceQuestion = question.kind === 'single' || question.kind === 'multiple';
  const isNumeric = question.kind === 'numeric';
  const canChoose = choiceQuestion && choiceCount > 0;
  const selfCheck = !canChoose && !isNumeric;
  const hasSourceQuestion = Boolean(question.regions?.length && renderRegions);
  const hasSourceAnswer = Boolean(question.answerRegions?.length && renderRegions);
  const selectedNumber = typeof value === 'string' ? numericValue(value) : NaN;
  const answerReady = selfCheck || (isNumeric ? Number.isFinite(selectedNumber) : selected.length > 0);
  const answerKey = question.answers?.length && question.answers.every(answer => Number.isInteger(answer) && answer >= 0 && answer < choiceCount)
    ? [...new Set(question.answers)].sort((left, right) => left - right) : undefined;
  const answerLabel = question.answerText ?? (isNumeric && question.numericAnswer !== undefined ? String(question.numericAnswer)
    : answerKey?.map(optionLetter).join(', '));

  function choose(index: number) {
    setValue(question.kind === 'single' ? [index] : selected.includes(index)
      ? selected.filter(item => item !== index) : [...selected, index].sort((left, right) => left - right));
  }

  function checkAnswer() {
    let correct: boolean | null = null;
    if (canChoose && answerKey) correct = selected.length === answerKey.length && selected.every((item, index) => item === answerKey[index]);
    if (isNumeric && question.numericAnswer !== undefined) correct = selectedNumber === question.numericAnswer;
    const next = { chapterId: chapter.id, value: selfCheck ? '' : value, correct };
    setResult(next);
    onAnswer(question.id, next);
  }

  return <div className="practice-question-body">
    <div className="practice-question-prompt">
      {hasSourceQuestion && question.regions ? renderRegions?.(chapter, question, question.regions, 'Question from the original PDF')
        : question.prompt && <Markdown>{question.prompt}</Markdown>}
      {question.image && !hasSourceQuestion && <img src={question.image} alt="Diagram from the original question" />}
      {hasSourceQuestion && question.prompt && <details className="practice-question-transcript">
        <summary>Read extracted text</summary>
        <p>Check the original PDF for symbols, diagrams, and text that may differ.</p>
        <Markdown>{question.prompt}</Markdown>
      </details>}
    </div>

    {canChoose && <fieldset className="practice-choice-group">
      <legend className={question.kind === 'multiple' ? undefined : 'sr-only'}>{question.kind === 'multiple' ? 'Select all correct options' : 'Select one option'}</legend>
      <div className="practice-options">
        {Array.from({ length: choiceCount }, (_, index) => {
          const checked = selected.includes(index);
          const outcome = result && answerKey?.includes(index) ? 'correct' : result && checked && result.correct === false ? 'incorrect' : undefined;
          const option = question.options?.[index];
          return <label key={index} className="practice-option" data-checked={checked} data-outcome={outcome}>
            <input type={question.kind === 'single' ? 'radio' : 'checkbox'} name={`practice-${question.id}`} checked={checked} disabled={Boolean(result)}
              onChange={() => choose(index)} aria-label={option ? undefined : `Option ${optionLetter(index)}`} />
            <span className="practice-option-letter" aria-hidden="true">{optionLetter(index)}</span>
            {option ? <span className="practice-option-text"><Markdown>{option}</Markdown></span> : <span>Option {optionLetter(index)}</span>}
            {outcome === 'correct' && <Check size={16} aria-label="Correct option" />}
            {outcome === 'incorrect' && <X size={16} aria-label="Incorrect option" />}
          </label>;
        })}
      </div>
    </fieldset>}

    {isNumeric && <form className="practice-numeric" onSubmit={event => {
      event.preventDefault();
      if (answerReady && !result) checkAnswer();
    }}>
      <label>Enter your answer<input type="text" autoComplete="off" spellCheck={false} placeholder="Number or fraction" value={typeof value === 'string' ? value : ''} readOnly={Boolean(result)}
        onChange={event => setValue(event.target.value)} /></label>
    </form>}

    {result && <div className="practice-feedback" data-outcome={result.correct === null ? 'reviewed' : result.correct ? 'correct' : 'incorrect'}>
      <h3 role="status">{result.correct === null ? 'Check the answer' : result.correct ? 'Correct' : 'Incorrect'}</h3>
      {answerLabel && <Markdown>{`**Answer:** ${answerLabel}`}</Markdown>}
      {question.explanation && <Markdown>{question.explanation}</Markdown>}
      {hasSourceAnswer && question.answerRegions && renderRegions?.(chapter, question, question.answerRegions, 'Answer from the original PDF')}
      {!answerLabel && !question.explanation && !hasSourceAnswer && <p>An answer key was not available for this question.</p>}
    </div>}

    <div className="practice-question-actions">
      {result ? !selfCheck && <button type="button" className="practice-button" onClick={() => setResult(undefined)}>Try again</button>
        : <button type="button" className="practice-button practice-button-primary" disabled={!answerReady} onClick={checkAnswer}>
          {selfCheck ? 'Reveal answer' : 'Check answer'} <ArrowRight size={15} />
        </button>}
      <button type="button" className="practice-button" disabled={saving || (saved && !onViewMistake)} aria-busy={saving}
        onClick={() => saved ? onViewMistake?.(question.id) : void onSaveMistake(chapter, question, result)}>
        {saved ? <Check size={16} /> : <BookMarked size={16} />}
        {saving ? 'Saving…' : saved ? (onViewMistake ? 'View in Mistake Book' : 'Saved to Mistake Book') : 'Add to Mistake Book'}
      </button>
      {onOpenSource && <button className="practice-source-link" type="button" onClick={() => onOpenSource(chapter, question)}>
        <FileText size={15} /> View source
      </button>}
    </div>
  </div>;
}

export default PracticePage;
