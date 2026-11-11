import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Paperclip } from 'lucide-react';
import type { PracticeActivity, Subject } from './model';
import { day, uid } from './model';
import { fileStore, useStore } from './store';
import { PracticePage } from './PracticePage';
import type { PracticeChapter, PracticeProgressEntry, PracticeQuestion, PracticeRegion } from './practice-types';
import { attachPracticeBook, combinePracticeImages, findPracticeSource, loadPracticeLibrary, openPracticeSource, renderPracticeRegion } from './practice-library';
import type { PracticeLibrary } from './practice-library';
import { Modal } from './ui';

type Source = Blob | string;
type LoadingTask = Awaited<ReturnType<typeof openPracticeSource>>;
type RenderExcerpt = (chapter: PracticeChapter, regions: PracticeRegion[]) => Promise<Blob[]>;
const emptyActivity: PracticeActivity = { resume: null, progress: {} };
const mistakeId = (id: string) => `chapter-practice:${id}`;
const subjectColors: Record<PracticeChapter['subject'], Subject['color']> = { Mathematics: 'purple', Physics: 'blue', Chemistry: 'orange' };

function sourcePages(chapter: PracticeChapter, questions: PracticeQuestion[], total: number): PracticeRegion[] {
  if (chapter.sourceRegions?.length) return chapter.sourceRegions;
  const start = chapter.startPage ?? questions[0]?.page ?? 1;
  const last = questions.at(-1);
  const end = Math.min(total, chapter.endPage ?? last?.regions?.at(-1)?.page ?? last?.page ?? start);
  return Array.from({ length: Math.max(1, end - start + 1) }, (_, index) => ({ page: start + index, x: 0, y: 0, width: 1, height: 1 }));
}

function PrintedExcerpt({ chapter, regions, description, render, attach, attaching }: {
  chapter: PracticeChapter;
  regions: PracticeRegion[];
  description: string;
  render?: RenderExcerpt;
  attach: () => void;
  attaching: boolean;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!render) return;
    setImages([]);
    setError('');
    let active = true;
    const urls: string[] = [];
    void render(chapter, regions).then(blobs => {
      if (!active) return;
      for (const blob of blobs) urls.push(URL.createObjectURL(blob));
      setImages(urls);
    }).catch(() => { if (active) setError('This page could not be rendered. Reattach the original PDF to try again.'); });
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [chapter, regions, render]);
  if (error || !render) return <div className="practice-source-message"><p>{error || `Attach the ${chapter.subject} PDF to view this printed excerpt.`}</p><button className="button secondary" type="button" disabled={attaching} onClick={attach}><Paperclip size={15}/>Attach source PDF</button></div>;
  if (!images.length) return <p className="practice-source-message" role="status">Opening the printed excerpt…</p>;
  return <div className="practice-source-images">{images.map((url, index) => <img key={url} src={url} alt={`${description}${images.length > 1 ? `, part ${index + 1}` : ''}, PDF page ${regions[index].page}`}/>)}</div>;
}

function answerLabel(question: PracticeQuestion, value: number[] | string) {
  return typeof value === 'string' ? value : value.map(index => {
    const letter = String.fromCharCode(65 + index);
    return question.options?.[index] ? `${letter}. ${question.options[index]}` : letter;
  }).join('\n\n');
}

export default function PracticeRoute({ onOpenMistake }: { onOpenMistake: (id: string) => void }) {
  const { data, update, notify } = useStore();
  const activity = data.practice ?? emptyActivity;
  const [library, setLibrary] = useState<PracticeLibrary>();
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [sources, setSources] = useState<Record<string, Source>>({});
  const [attaching, setAttaching] = useState(false);
  const [attachmentErrors, setAttachmentErrors] = useState<string[]>([]);
  const [savingMistakeId, setSavingMistakeId] = useState<string>();
  const [sourceReader, setSourceReader] = useState<{ chapter: PracticeChapter; page: number }>();
  const input = useRef<HTMLInputElement>(null);
  const documents = useRef(new Map<string, { source: Source; task: Promise<LoadingTask> }>());
  const images = useRef(new Map<string, Promise<Blob>>());
  const inProgress = useRef<string | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void loadPracticeLibrary(controller.signal).then(async index => {
      const available = await Promise.all(index.books.map(async book => [book.id, await findPracticeSource(book, controller.signal)] as const));
      if (controller.signal.aborted) return;
      setSources(Object.fromEntries(available.filter((entry): entry is readonly [string, Source] => entry[1] !== undefined)));
      setLibrary(index);
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : 'Could not open chapter practice.'); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    const entries = documents.current, cache = images.current;
    return () => {
      for (const { task } of entries.values()) void task.then(item => item.destroy()).catch(() => {});
      entries.clear();
      cache.clear();
    };
  }, []);

  const loadQuestions = useCallback(async (chapter: PracticeChapter) => {
    const indexed = library?.chapters.find(item => item.id === chapter.id);
    if (!indexed) throw new Error('This chapter is not in the practice index.');
    return indexed.questions;
  }, [library]);

  const renderImages = useCallback<RenderExcerpt>(async (chapter, regions) => {
    const bookId = chapter.bookId;
    const source = bookId && sources[bookId];
    if (!source || !bookId) throw new Error(`Attach the ${chapter.subject} PDF first.`);
    const opened = documents.current.get(bookId);
    const task = opened?.source === source ? opened.task : openPracticeSource(source);
    if (opened?.source !== source) {
      documents.current.set(bookId, { source, task });
      if (opened) void opened.task.then(item => item.destroy()).catch(() => {});
    }
    const pdf = await task.then(item => item.promise).catch(error => {
      if (documents.current.get(bookId)?.task === task) documents.current.delete(bookId);
      void task.then(item => item.destroy()).catch(() => {});
      throw error;
    });
    return Promise.all(regions.map(region => {
      const key = `${bookId}:${region.page}:${region.rotation ?? 0}:${region.x}:${region.y}:${region.width}:${region.height}`;
      const existing = images.current.get(key);
      if (existing) {
        images.current.delete(key);
        images.current.set(key, existing);
        return existing;
      }
      const rendered = renderPracticeRegion(pdf, region).catch(error => { images.current.delete(key); throw error; });
      images.current.set(key, rendered);
      if (images.current.size > 32) images.current.delete(images.current.keys().next().value!);
      return rendered;
    }));
  }, [sources]);

  async function attach(files: File[]) {
    if (!library || !files.length) return;
    setAttaching(true);
    setAttachmentErrors([]);
    const errors: string[] = [];
    let count = 0;
    for (const file of files) {
      try {
        const book = await attachPracticeBook(file, library.books);
        setSources(previous => ({ ...previous, [book.id]: file }));
        count++;
      } catch (error) { errors.push(error instanceof Error ? error.message : 'A book could not be attached.'); }
    }
    setAttachmentErrors(errors);
    setAttaching(false);
    if (count) notify(count === 1 ? 'Practice book attached' : `${count} practice books attached`);
  }

  async function saveMistake(chapter: PracticeChapter, question: PracticeQuestion, entry?: PracticeProgressEntry) {
    const id = mistakeId(question.id);
    if (inProgress.current || data.mistakes.some(mistake => mistake.id === id)) return;
    inProgress.current = id;
    setSavingMistakeId(question.id);
    try {
      const promptRegions = question.regions ?? [], solutionRegions = question.answerRegions ?? [];
      const [promptImage, solutionImage] = await Promise.all([
        promptRegions.length ? renderImages(chapter, promptRegions).then(combinePracticeImages) : undefined,
        solutionRegions.length ? renderImages(chapter, solutionRegions).then(combinePracticeImages) : undefined,
      ]);
      const imageKey = promptImage ? `${id}:question` : undefined;
      const solutionImageKey = solutionImage ? `${id}:answer` : undefined;
      if (promptImage && imageKey) await fileStore('put', imageKey, promptImage);
      if (solutionImage && solutionImageKey) await fileStore('put', solutionImageKey, solutionImage);

      const source = [question.source || chapter.source || 'JEE Advanced practice', question.year, question.page && `PDF page ${question.page}`].filter(Boolean).join(' · ');
      const options = question.options?.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('\n\n');
      const prompt = [promptImage ? 'Use the attached printed question.' : question.prompt || 'Open the original question in Chapter Practice.', !promptImage && options, source].filter(Boolean).join('\n\n');
      const key = question.answerText || (question.answers?.length ? answerLabel(question, question.answers) : question.numericAnswer?.toString());
      const solution = [key ? `**Answer**\n\n${key}` : '', question.explanation, solutionImage && 'See the attached printed answer.',
        !key && !question.explanation && !solutionImage && 'The source index has no verified answer for this question.'].filter(Boolean).join('\n\n');
      const position = library?.chapters.find(item => item.id === chapter.id)?.questions.findIndex(item => item.id === question.id) ?? -1;
      const title = `${chapter.title} · Question ${position + 1}`;

      update(state => {
        if (state.mistakes.some(mistake => mistake.id === id)) return state;
        const names = chapter.subject === 'Mathematics' ? ['mathematics', 'maths', 'math'] : [chapter.subject.toLowerCase()];
        const existing = state.subjects.find(subject => names.includes(subject.name.trim().toLowerCase()));
        const subject = existing ?? { id: uid(), name: chapter.subject, color: subjectColors[chapter.subject] };
        return {
          ...state,
          subjects: existing ? state.subjects : [...state.subjects, subject],
          folders: existing ? state.folders : [...state.folders, { id: uid(), name: subject.name, parent: null, subject: subject.id, pinned: false, mastery: 0 }],
          mistakes: [{
            id, title, subject: subject.id, topic: chapter.title, category: 'Chapter practice', prompt,
            wrong: entry ? answerLabel(question, entry.value) : '', solution, takeaway: '',
            difficulty: 3, status: 'Needs review', review: day(), attempts: 0, image: imageKey, solutionImage: solutionImageKey,
          }, ...state.mistakes],
        };
      });
      notify('Question added to your Mistake Book');
    } catch (error) { notify(error instanceof Error ? error.message : 'The question could not be saved.'); }
    finally { inProgress.current = undefined; setSavingMistakeId(undefined); }
  }

  if (loadError) return <div className="practice-source-message" role="alert"><p>{loadError}</p><button className="button secondary" onClick={() => { setLoadError(''); setRetry(value => value + 1); }}>Try again</button></div>;
  if (!library) return <p className="route-loading" role="status">Loading the chapter index…</p>;

  function openOriginal(source: Source, page: number) {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    window.open(`${url}#page=${page}`, '_blank', 'noopener');
    if (typeof source !== 'string') window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }

  const readingChapter = library.chapters.find(chapter => chapter.id === sourceReader?.chapter.id);
  const readingBook = library.books.find(book => book.id === readingChapter?.bookId);
  const pages = readingChapter && readingBook ? sourcePages(readingChapter, readingChapter.questions, readingBook.pageCount) : [];
  const pageIndex = Math.max(0, pages.findIndex(region => region.page === sourceReader?.page));
  const currentPage = pages[pageIndex];
  const readerSource = readingBook ? sources[readingBook.id] : undefined;

  function navigateSource(index: number) {
    const page = pages[index]?.page;
    if (readingChapter && page) setSourceReader({ chapter: readingChapter, page });
  }

  const controls = <div className="practice-book-controls">
    <button type="button" className="button secondary" disabled={attaching} onClick={() => input.current?.click()}><Paperclip size={15}/>{attaching ? 'Attaching books…' : 'Attach source PDFs'}</button>
    {attachmentErrors.length > 0 && <div role="alert">{attachmentErrors.map(message => <p key={message}>{message}</p>)}</div>}
  </div>;
  return <>
    <input ref={input} hidden type="file" multiple accept=".pdf,application/pdf" aria-label="Attach source PDFs" onChange={event => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = '';
      void attach(files);
    }}/>
    <PracticePage chapters={library.chapters} loadQuestions={loadQuestions} progress={activity.progress} resume={activity.resume}
      onPosition={(chapterId, questionIndex) => update(state => {
        const current = state.practice ?? emptyActivity;
        if (current.resume?.chapterId === chapterId && current.resume.questionIndex === questionIndex) return state;
        return { ...state, practice: { ...current, resume: { chapterId, questionIndex } } };
      })}
      onAnswer={(questionId, entry) => update(state => {
        const current = state.practice ?? emptyActivity;
        return { ...state, practice: { ...current, progress: { ...current.progress, [questionId]: entry } } };
      })}
      onSaveMistake={saveMistake} savingMistakeId={savingMistakeId} isSaved={id => data.mistakes.some(mistake => mistake.id === mistakeId(id))}
      onViewMistake={id => onOpenMistake(mistakeId(id))}
      onOpenSource={(chapter, question) => setSourceReader({ chapter, page: question.page ?? question.regions?.[0]?.page ?? 1 })}
      onOpenChapterSource={chapter => setSourceReader({ chapter, page: chapter.startPage ?? 1 })}
      libraryControls={controls}
      renderRegions={(chapter, question, regions, description) => <PrintedExcerpt key={`${question.id}:${description}`} chapter={chapter} regions={regions}
        description={description} render={chapter.bookId && sources[chapter.bookId] ? renderImages : undefined}
        attach={() => input.current?.click()} attaching={attaching}/>} />
    {readingChapter && currentPage && <Modal title={`Source pages: ${readingChapter.title}`} onClose={() => setSourceReader(undefined)} wide>
      <div className="modal-body practice-page practice-source-reader">
        <div className="practice-source-reader-tools">
          <button type="button" className="button secondary" disabled={pageIndex === 0} onClick={() => navigateSource(pageIndex - 1)}><ArrowLeft size={15}/>Previous page</button>
          <label>PDF page <select value={pageIndex} onChange={event => navigateSource(Number(event.currentTarget.value))}>
            {pages.map((region, index) => <option value={index} key={region.page}>{region.page}</option>)}
          </select></label>
          <button type="button" className="button secondary" disabled={pageIndex >= pages.length - 1} onClick={() => navigateSource(pageIndex + 1)}>Next page<ArrowRight size={15}/></button>
          {readerSource && <button type="button" className="practice-source-link" onClick={() => openOriginal(readerSource, currentPage.page)}>Open original PDF<ExternalLink size={14}/></button>}
        </div>
        <PrintedExcerpt key={currentPage.page} chapter={readingChapter} regions={[currentPage]} description="Original chapter page" render={readerSource ? renderImages : undefined}
          attach={() => input.current?.click()} attaching={attaching}/>
      </div>
    </Modal>}
  </>;
}
