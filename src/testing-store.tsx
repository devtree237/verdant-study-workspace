import { useCallback, useRef, useState } from 'react';
import type { CohortRecord, TestAttempt, TestPaper } from './testing-model';
import { paperFingerprint, parseCohortJSON, validateAttempt, validatePaper } from './testing-model';

const KEY = 'verdant.testing.v1';
export type TestingState = {
  version: 1;
  papers: TestPaper[];
  attempts: TestAttempt[];
  activeAttempt: TestAttempt | null;
  cohorts: Record<string, CohortRecord[]>;
};
const empty = (): TestingState => ({ version: 1, papers: [], attempts: [], activeAttempt: null, cohorts: {} });

/** Scope comparisons to the canonical question order, answer key and scoring scheme. */
export function paperComparisonKey(paper: TestPaper): string {
  return `${paper.id}:${paperFingerprint(paper)}`;
}

export function validateTestingState(raw: unknown): TestingState {
    const value = raw as Record<string, unknown>;
    if (value?.version !== 1 || !Array.isArray(value.papers) || !Array.isArray(value.attempts)) throw new Error('The saved testing workspace has an unsupported format.');
    const papers = value.papers.map((paper: unknown) => validatePaper(paper));
    const attempts = value.attempts.map((attempt: unknown) => validateAttempt(attempt)).filter((attempt: TestAttempt) => attempt.status === 'submitted');
    if (new Set(papers.map(paper => paper.id)).size !== papers.length || new Set(attempts.map((attempt: TestAttempt) => attempt.id)).size !== attempts.length) throw new Error('Saved papers and submitted attempts must have unique IDs.');
    const activeAttempt = value.activeAttempt ? validateAttempt(value.activeAttempt) : null;
    if (activeAttempt?.status === 'running' && attempts.some((attempt: TestAttempt) => attempt.id === activeAttempt.id)) throw new Error('A submitted attempt cannot also be a running attempt.');
    const cohorts: Record<string, CohortRecord[]> = {};
    if (value.cohorts !== undefined && (!value.cohorts || typeof value.cohorts !== 'object' || Array.isArray(value.cohorts))) throw new Error('Saved comparison records must be grouped by paper.');
    for (const [key, rows] of Object.entries(value.cohorts || {})) {
      if (!Array.isArray(rows)) throw new Error('Each paper comparison must contain an array of results.');
      cohorts[key] = rows.length ? parseCohortJSON(JSON.stringify(rows)) : [];
    }
    // Upgrade earlier ID-only cohorts only when every saved snapshot agrees.
    const snapshots = [...papers, ...attempts.map((attempt: TestAttempt) => attempt.paper), ...(activeAttempt ? [activeAttempt.paper] : [])];
    for (const paper of snapshots) {
      const key = paperComparisonKey(paper);
      if (!cohorts[paper.id] || cohorts[key]) continue;
      if (snapshots.filter(item => item.id === paper.id).every(item => paperComparisonKey(item) === key)) cohorts[key] = cohorts[paper.id];
    }
    return { version: 1, papers, attempts: activeAttempt?.status === 'submitted' && !attempts.some((attempt: TestAttempt) => attempt.id === activeAttempt.id) ? [activeAttempt, ...attempts] : attempts, activeAttempt: activeAttempt?.status === 'running' ? activeAttempt : null, cohorts };
}

function read(): { data: TestingState; error: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { data: empty(), error: '' };
    return { data: validateTestingState(JSON.parse(raw)), error: '' };
  } catch (error) {
    return { data: empty(), error: `Your saved tests could not be opened. The stored copy has been retained. ${error instanceof Error ? error.message : ''}` };
  }
}

export function useTestingStore() {
  const [initial] = useState(read);
  const [data, setData] = useState(initial.data);
  const current = useRef(initial.data);
  const [storageError, setStorageError] = useState(initial.error);
  const update = useCallback((fn: (state: TestingState) => TestingState) => {
    const next = fn(current.current);
    if (next === current.current) return;
    current.current = next;
    setData(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('This browser could not save your test changes. Keep this tab open and export your papers or results before leaving.'); }
  }, []);
  return { data, update, storageError };
}
