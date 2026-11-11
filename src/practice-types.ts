import type { ReactNode } from 'react';

export type PracticeSubject = 'Mathematics' | 'Physics' | 'Chemistry';

export type PracticeChapter = {
  id: string;
  title: string;
  subject: PracticeSubject;
  count: number;
  level?: string;
  source?: string;
  bookId?: string;
  startPage?: number;
  endPage?: number;
  sourceRegions?: PracticeRegion[];
};

export type PracticeRegion = { page: number; x: number; y: number; width: number; height: number; rotation?: 0 | 90 | 180 | 270 };

export type PracticeQuestion = {
  id: string;
  number?: number;
  label?: string;
  prompt?: string;
  options?: string[];
  optionCount?: number;
  kind: 'single' | 'multiple' | 'numeric' | 'self';
  answers?: number[];
  numericAnswer?: number;
  answerText?: string;
  explanation?: string;
  year?: number;
  page?: number;
  source?: string;
  image?: string;
  regions?: PracticeRegion[];
  answerRegions?: PracticeRegion[];
};

export type PracticeProgressEntry = { chapterId: string; value: number[] | string; correct: boolean | null };
export type PracticePosition = { chapterId: string; questionIndex: number };

export type PracticePageProps = {
  chapters: PracticeChapter[];
  loadQuestions: (chapter: PracticeChapter) => Promise<PracticeQuestion[]>;
  progress: Record<string, PracticeProgressEntry>;
  resume: PracticePosition | null;
  onPosition: (chapterId: string, questionIndex: number) => void;
  onAnswer: (questionId: string, entry: PracticeProgressEntry) => void;
  onSaveMistake: (chapter: PracticeChapter, question: PracticeQuestion, entry?: PracticeProgressEntry) => void | Promise<void>;
  isSaved?: (id: string) => boolean;
  onViewMistake?: (id: string) => void;
  savingMistakeId?: string | null;
  onOpenSource?: (chapter: PracticeChapter, question: PracticeQuestion) => void;
  onOpenChapterSource?: (chapter: PracticeChapter) => void;
  renderRegions?: (chapter: PracticeChapter, question: PracticeQuestion, regions: PracticeRegion[], description: string) => ReactNode;
  libraryControls?: ReactNode;
};
