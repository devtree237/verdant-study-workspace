import { describe, expect, it } from 'vitest';
import { mergeCbtAnswerKey, normalizeCbtSourceNumber, parseCbtAnswerKey } from './cbt-answer-key';
import type { CbtAnswerKeyParse } from './cbt-answer-key';
import type { CbtDraftQuestion } from './cbt-import';

const question = (sourceNumber = '1', patch: Partial<CbtDraftQuestion> = {}): CbtDraftQuestion => ({
  id: 'question-' + sourceNumber, sourceNumber, prompt: 'Supplied question', subject: '', chapter: '', topic: '',
  difficulty: 'Moderate', kind: 'single', options: ['One', 'Two', 'Three', 'Four'], correctAnswers: [],
  marks: 4, negativeMarks: 1, idealSeconds: 120, explanation: '', ...patch,
});
const answers = (source: string, format: 'text' | 'latex' = 'text') => parseCbtAnswerKey(source, format).entries.map(entry => entry.answer);

describe('separate answer-key parsing', () => {
  it('normalizes identifiers while retaining section/subquestion distinctions', () => {
    expect(['Q01', '(01)', '1(a)', '1.a', 'Question 002', 'A-01', '1.01'].map(normalizeCbtSourceNumber)).toEqual(['1', '1', '1a', '1a', '2', 'a-1', '1.1']);
    expect(normalizeCbtSourceNumber('1.1')).not.toBe(normalizeCbtSourceNumber('11'));
    expect(normalizeCbtSourceNumber('chapter one')).toBe('');
  });
  it('reads numbered pairs and multiple pairs on a line without reordering by position', () => {
    const parsed = parseCbtAnswerKey('Answer key: 7: B; 9: A,C\n12. D\n15 = A\n16 A and C\n18 A 19 C');
    expect(parsed.entries.map(entry => entry.sourceNumber)).toEqual(['7', '9', '12', '15', '16', '18', '19']);
    expect(parsed.entries.map(entry => entry.answer)).toEqual([
      { kind: 'choice', labels: ['B'] }, { kind: 'choice', labels: ['A', 'C'] }, { kind: 'choice', labels: ['D'] },
      { kind: 'choice', labels: ['A'] }, { kind: 'choice', labels: ['A', 'C'] }, { kind: 'choice', labels: ['A'] }, { kind: 'choice', labels: ['C'] },
    ]);
  });
  it.each(['AC', 'A C', 'A,C,A and C', '(A)(C)', '{A,C}', 'a,c', 'a and c', 'A/C', 'A&C', 'A+C'])('strictly recognizes the complete multi-answer token %s', value => {
    expect(answers('1: ' + value)).toEqual([{ kind: 'choice', labels: ['A', 'C'] }]);
  });
  it.each(['bad', 'A or C', 'A-Z', 'A,,C', '(AB)', 'A U', 'A; maybe C', 'A (see note)', '2 +/- -0.1', '1e999'])('does not accept invalid or partially recognized tokens: %s', value => {
    const parsed = parseCbtAnswerKey('1: ' + value);
    expect(parsed.entries.every(entry => !entry.answer)).toBe(true);
    expect(parsed.entries[0]?.issue).toBeTruthy();
  });
  it('reads signed decimals, zero, exponent values and explicit tolerance', () => {
    expect(answers('1: 0\n2: -2.50 ± 0.01\n3: +.25 +/- .001\n4: 1.2e3')).toEqual([
      { kind: 'numeric', value: 0, tolerance: 0 }, { kind: 'numeric', value: -2.5, tolerance: .01 },
      { kind: 'numeric', value: .25, tolerance: .001 }, { kind: 'numeric', value: 1200, tolerance: 0 },
    ]);
  });
  it('keeps bare numbers numerical and requires explicit option labels for numeric choices', () => {
    expect(answers('1: 3\n2: options 1 and 3\n3: choices (1), (3)')).toEqual([
      { kind: 'numeric', value: 3, tolerance: 0 }, { kind: 'choice', labels: ['1', '3'] }, { kind: 'choice', labels: ['1', '3'] },
    ]);
    expect(answers('1: options 0 and 2')).toEqual([undefined]);
  });
  it('reads repeated Q/Key/Level groups without using difficulty cells as answers', () => {
    const parsed = parseCbtAnswerKey('Q  Key  Level  Q  Key  Level  Q  Key  Level\n1  C  M  11  A  H  21  D  M\n2  B  H  12  0  M  22  AC  M');
    expect(parsed.entries.map(entry => entry.sourceNumber)).toEqual(['1', '11', '21', '2', '12', '22']);
    expect(parsed.entries.map(entry => entry.answer)).toEqual([
      { kind: 'choice', labels: ['C'] }, { kind: 'choice', labels: ['A'] }, { kind: 'choice', labels: ['D'] },
      { kind: 'choice', labels: ['B'] }, { kind: 'numeric', value: 0, tolerance: 0 }, { kind: 'choice', labels: ['A', 'C'] },
    ]);
  });
  it('reads pipe-delimited key tables and rejects incomplete rows without guessing shifts', () => {
    const parsed = parseCbtAnswerKey('| Q | Answer | Level |\n| 7 | A,C | Hard |\n| 9 | B |\n| 10 | D | Easy |');
    expect(parsed.entries.map(entry => entry.sourceNumber)).toEqual(['7', '10']);
    expect(parsed.warnings.join(' ')).toContain('inconsistent columns');
  });
  it('pairs horizontal question and answer rows by exact column count', () => {
    expect(answers('Q 1 7 12\nAnswer A C 0')).toEqual([{ kind: 'choice', labels: ['A'] }, { kind: 'choice', labels: ['C'] }, { kind: 'numeric', value: 0, tolerance: 0 }]);
    const mismatch = parseCbtAnswerKey('Questions 1 2 3\nAnswers A C');
    expect(mismatch.entries).toEqual([]);
    expect(mismatch.warnings.join(' ')).toContain('different column counts');
  });
  it('reads LaTeX tabular groups, ignores rules and accepts equivalent explanatory repeats', () => {
    const source = String.raw`\begin{tabular}{llllll}
      \toprule \textbf{Q} & \textbf{Key} & \textbf{Level} & Q & Key & Level \\ \midrule
      1 & C & M & 11 & {A,C} & H \\
      2 & $-2.5 \pm 0.1$ & H & 12 & A & M \\ \bottomrule
      \end{tabular}
      \begin{questionblock}{1}\textbf{Answer C | M}\par Because the supplied explanation says so.\end{questionblock}
      \begin{questionblock}{11}\textbf{Answer A,C | H}\par More prose.\end{questionblock}`;
    const parsed = parseCbtAnswerKey(source, 'latex');
    expect(parsed.entries).toHaveLength(4);
    expect(parsed.entries.every(entry => entry.answer && !entry.conflict)).toBe(true);
    expect(parsed.entries[2].answer).toEqual({ kind: 'numeric', value: -2.5, tolerance: .1 });
  });
  it('reads longtable, tabular star and explicit two-argument answer macros without executing TeX', () => {
    const source = String.raw`\begin{longtable}{ll} Q & Key \\ 1 & A \\ \end{longtable}
      \begin{tabular*}{\linewidth}{ll} Q & Key \\ 2 & C \\ \end{tabular*}
      \answer{3}{AC} \correctanswer{4}{$0$}
      % \answer{5}{B}
      \input{https://example.invalid/key}`;
    expect(answers(source, 'latex')).toEqual([{ kind: 'choice', labels: ['A'] }, { kind: 'choice', labels: ['C'] }, { kind: 'choice', labels: ['A', 'C'] }, { kind: 'numeric', value: 0, tolerance: 0 }]);
  });
  it('reads numbered enumerate keys, optional start and explicit item numbers', () => {
    expect(parseCbtAnswerKey(String.raw`\begin{enumerate}[start=7]\item A\item (B)(D)\item[12.] 0\end{enumerate}`, 'latex').entries).toEqual([
      { sourceNumber: '7', answer: { kind: 'choice', labels: ['A'] } },
      { sourceNumber: '8', answer: { kind: 'choice', labels: ['B', 'D'] } },
      { sourceNumber: '12.', answer: { kind: 'numeric', value: 0, tolerance: 0 } },
    ]);
  });
  it('does not infer keys from explanatory paragraphs or advice enumerations', () => {
    const source = String.raw`1. Because A is supplied by the explanation.
      \begin{enumerate}\item Review chapter A.\item Check errors before retrying.\end{enumerate}
      \begin{questionblock}{9}A question without a supplied key.\end{questionblock}`;
    expect(parseCbtAnswerKey(source, 'latex').entries).toEqual([]);
    expect(parseCbtAnswerKey('1. Paint provides a barrier.\n2. Review the core ideas.\n3. _______').entries).toEqual([]);
  });
  it('accepts repeated explicitly labeled answer headlines with difficulty metadata and ignores blank revision targets', () => {
    const text = 'Q  Key  Level\n1  C  M\n2  A  H\nExplanations\n1. Answer C | M\nSome explanatory prose.\n2. Answer A | H\nAnother explanatory paragraph.\n1. _______\n2. _______';
    expect(parseCbtAnswerKey(text).entries).toEqual([
      { sourceNumber: '1', answer: { kind: 'choice', labels: ['C'] }, explanation: 'Some explanatory prose.' },
      { sourceNumber: '2', answer: { kind: 'choice', labels: ['A'] }, explanation: 'Another explanatory paragraph.' },
    ]);
    const latex = String.raw`\answer{1}{C}\answer{2}{A}
      1. \rule{140mm}{0.3pt}\par
      2. \rule{140mm}{0.3pt}`;
    expect(parseCbtAnswerKey(latex, 'latex').entries.every(entry => !!entry.answer && !entry.conflict)).toBe(true);
    expect(answers('1: A | C')).toEqual([undefined]);
  });
  it('ignores isolated numerical PDF fragments outside key tables without poisoning valid supplied keys', () => {
    const parsed = parseCbtAnswerKey('Q  Key  Level\n2  A  H\n3  D  M\n4  B  H\nExplanations\n2. Answer A | H\nChemical explanation\n2    3\n4 2    4\n2 3    2    4\n3. Answer D | M\n4. Answer B | H');
    expect(parsed.entries.map(entry => entry.answer)).toEqual([{ kind: 'choice', labels: ['A'] }, { kind: 'choice', labels: ['D'] }, { kind: 'choice', labels: ['B'] }]);
    expect(parsed.entries.every(entry => !entry.conflict)).toBe(true);
    expect(answers('1 0\n2 3\n3 Answer 0\n4: 0')).toEqual([{ kind: 'numeric', value: 0, tolerance: 0 }, { kind: 'numeric', value: 0, tolerance: 0 }]);
    expect(parseCbtAnswerKey('1: A\n1: A or C').entries[0].conflict).toBe(true);
  });
  it('accepts equivalent duplicate keys but makes conflicting or invalid duplicates sticky', () => {
    const parsed = parseCbtAnswerKey('Q01: AC\n1: C and A\n2: A\n2: B\n2: A\n3: C\n3: A or C\n3: C');
    expect(parsed.entries).toEqual([
      { sourceNumber: '01', answer: { kind: 'choice', labels: ['A', 'C'] } },
      { sourceNumber: '2', conflict: true, issue: expect.any(String) }, { sourceNumber: '3', conflict: true, issue: expect.any(String) },
    ]);
  });
  it('enforces source and entry limits without silently truncating keys', () => {
    expect(() => parseCbtAnswerKey('x'.repeat(4_000_001))).toThrow('4 million');
    expect(() => parseCbtAnswerKey(Array.from({ length: 1001 }, (_, index) => `${index + 1}: A`).join('\n'))).toThrow('1,000');
  });
});

describe('separate answer-key merging', () => {
  it('matches normalized source identifiers without positional fallback and preserves inputs', () => {
    const original = [question('7'), question('9')], snapshot = structuredClone(original);
    const result = mergeCbtAnswerKey(original, parseCbtAnswerKey('9: C\nQ007: B\n10: A'));
    expect(result.questions.map(item => item.correctAnswers)).toEqual([[1], [2]]);
    expect(result.rows.map(row => row.status)).toEqual(['applied', 'applied', 'unmatched']);
    expect(original).toEqual(snapshot);
    expect(result.applied).toBe(2);
  });
  it('protects existing differing answers in fill mode and only replaces valid matching keys explicitly', () => {
    const original = [question('1', { correctAnswers: [1] })], key = parseCbtAnswerKey('1: C');
    const filled = mergeCbtAnswerKey(original, key);
    expect(filled.rows[0].status).toBe('conflict');
    expect(filled.questions[0]).toBe(original[0]);
    const replaced = mergeCbtAnswerKey(original, key, 'replace');
    expect(replaced.rows[0].status).toBe('applied');
    expect(replaced.questions[0].correctAnswers).toEqual([2]);
    expect(mergeCbtAnswerKey(original, parseCbtAnswerKey('1: B')).rows[0].status).toBe('kept');
  });
  it('does not apply source conflicts, invalid tokens or duplicate draft numbers even in replace mode', () => {
    const original = [question('1', { correctAnswers: [0] }), question('2'), question('Q02'), question('3')];
    const result = mergeCbtAnswerKey(original, parseCbtAnswerKey('1: A\n1: B\n2: C\n3: A or C'), 'replace');
    expect(result.rows.map(row => row.status)).toEqual(['conflict', 'ambiguous', 'invalid']);
    expect(result.applied).toBe(0);
    expect(result.questions).toEqual(original);
  });
  it('maps original explicit labels rather than assuming extracted option order', () => {
    const result = mergeCbtAnswerKey([question('1', { sourceOptionLabels: ['C', 'A', 'D', 'B'] })], parseCbtAnswerKey('1: AC'));
    expect(result.questions[0]).toMatchObject({ correctAnswers: [0, 1], kind: 'multiple' });
    const numericLabels = mergeCbtAnswerKey([question('2', { sourceOptionLabels: ['3', '1', '4', '2'] })], parseCbtAnswerKey('2: options 1 and 3'));
    expect(numericLabels.questions[0].correctAnswers).toEqual([0, 1]);
  });
  it('rejects missing/duplicated option labels as a whole and never applies partial multi-answer keys', () => {
    const original = [question('1', { options: ['One', 'Two'], sourceOptionLabels: ['A', 'B'] }), question('2', { sourceOptionLabels: ['A', 'A', 'C', 'D'] })];
    const result = mergeCbtAnswerKey(original, parseCbtAnswerKey('1: AC\n2: C'));
    expect(result.rows.map(row => row.status)).toEqual(['invalid', 'ambiguous']);
    expect(result.applied).toBe(0);
    expect(result.questions).toEqual(original);
  });
  it('requires explicit options prefix for numeric choice positions and keeps numeric zero valid', () => {
    const original = [question('1'), question('2'), question('3', { kind: 'numeric', options: [] })];
    const result = mergeCbtAnswerKey(original, parseCbtAnswerKey('1: 1\n2: options 1 and 3\n3: 0'));
    expect(result.rows.map(row => row.status)).toEqual(['invalid', 'applied', 'applied']);
    expect(result.questions[1]).toMatchObject({ kind: 'multiple', correctAnswers: [0, 2] });
    expect(result.questions[2]).toMatchObject({ numericAnswer: 0, tolerance: 0 });
  });
  it('keeps explicit multiple-answer type and compares numerical answers including tolerance', () => {
    expect(mergeCbtAnswerKey([question('1', { kind: 'multiple' })], parseCbtAnswerKey('1: B')).questions[0].kind).toBe('multiple');
    const original = [question('1', { kind: 'numeric', options: [], numericAnswer: 0, tolerance: .1 })];
    expect(mergeCbtAnswerKey(original, parseCbtAnswerKey('1: 0 ± .1')).rows[0].status).toBe('kept');
    expect(mergeCbtAnswerKey(original, parseCbtAnswerKey('1: 0 ± .2')).rows[0].status).toBe('conflict');
  });
  it('rejects out-of-range values even if a caller supplies a typed result directly', () => {
    const key: CbtAnswerKeyParse = { entries: [{ sourceNumber: '1', answer: { kind: 'numeric', value: Infinity, tolerance: 0 } }], warnings: [] };
    const result = mergeCbtAnswerKey([question('1', { kind: 'numeric', options: [] })], key, 'replace');
    expect(result.rows[0].status).toBe('invalid');
    expect(result.applied).toBe(0);
  });
});
