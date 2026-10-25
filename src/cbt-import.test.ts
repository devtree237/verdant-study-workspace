import { describe, expect, it } from 'vitest';
import { getCbtQuestionIssues, latexToStudyText, parseCbtLatex, parseCbtText } from './cbt-import';

describe('offline numbered-question imports', () => {
  it('maps a trailing key by source number rather than array position, including multiple correct options', () => {
    const parsed = parseCbtText('7. First prompt\n(A) Alpha\n(B) Beta\n9. Second prompt\nA. One\nB. Two\nC. Three\nAnswer key:\n9: A,C\n7: B', { subject: 'Physics' });
    expect(parsed.questions.map(q => q.sourceNumber)).toEqual(['7', '9']);
    expect(parsed.questions[0]).toMatchObject({ prompt: 'First prompt', options: ['Alpha', 'Beta'], correctAnswers: [1], kind: 'single' });
    expect(parsed.questions[1]).toMatchObject({ correctAnswers: [0, 2], kind: 'multiple' });
    expect(parsed.questions.every(q => getCbtQuestionIssues(q).length === 0)).toBe(true);
  });
  it('does not invent answer keys, subjects or options when they are absent', () => {
    const parsed = parseCbtText('1. A question without a supplied key\nA) First\nB) Second\n2. A question without options');
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].correctAnswers).toEqual([]);
    expect(parsed.questions[0].subject).toBe('');
    expect(getCbtQuestionIssues(parsed.questions[0])).toContain('Select the correct answer key.');
    expect(parsed.questions[1].options).toEqual([]);
    expect(getCbtQuestionIssues(parsed.questions[1])).toContain('Add 2–20 complete answer options.');
  });
  it('supports zero and negative numerical answers with explicit tolerance and keeps inline plural answers local', () => {
    const parsed = parseCbtText('1. Calculate a value\nType: numeric\nAnswer: -2.5 ± 0.01\n2. Choose both\n(A) One\n(B) Two\nAnswers: A and B\n3. Calculate zero\nAnswer: 0', { subject: 'Mathematics' });
    expect(parsed.questions).toHaveLength(3);
    expect(parsed.questions[0]).toMatchObject({ kind: 'numeric', numericAnswer: -2.5, tolerance: .01 });
    expect(parsed.questions[1]).toMatchObject({ kind: 'multiple', correctAnswers: [0, 1] });
    expect(parsed.questions[2]).toMatchObject({ kind: 'numeric', numericAnswer: 0 });
  });
  it('retains extracted page provenance and blocks sources beyond the paper question limit', () => {
    expect(parseCbtText('[Page 4]\nQ12. Read this\nA. Yes\nB. No\nAnswer: A').questions[0]).toMatchObject({ sourceNumber: '12', sourcePage: 4 });
    expect(() => parseCbtText(Array.from({ length: 1001 }, (_, index) => `${index + 1}. Prompt\nA. Yes\nB. No`).join('\n'))).toThrow('1,000');
    expect(parseCbtText('Scanned content cannot be inferred.').questions).toEqual([]);
  });
  it('leaves conflicting keys unresolved even when another duplicate or inline answer follows', () => {
    const parsed = parseCbtText('1. Choose a value\nA. One\nB. Two\nAnswer: B\n2. Choose another\nA. Red\nB. Blue\nAnswer: A\nAnswer key:\n1: A\n1: B\n1: B\n2: B', { subject: 'Physics' });
    expect(parsed.questions.map(q => q.correctAnswers)).toEqual([[], []]);
    expect(parsed.questions.every(q => getCbtQuestionIssues(q).includes('Select the correct answer key.'))).toBe(true);
    expect(parsed.warnings.filter(warning => warning.startsWith('Conflicting answer keys'))).toHaveLength(2);
  });
  it('accepts equivalent supplied keys without false conflicts', () => {
    const parsed = parseCbtText('1. Select both\nA. One\nB. Two\nAnswers: B and A\n2. Compute\nAnswer: 2.50 ± 0.10\nAnswer key:\n1: A,B\n1: B,A\n2: 2.5 ± 0.1', { subject: 'Mathematics' });
    expect(parsed.questions[0].correctAnswers).toEqual([0, 1]);
    expect(parsed.questions[1]).toMatchObject({ numericAnswer: 2.5, tolerance: .1 });
    expect(parsed.warnings).toEqual([]);
  });
});

describe('LaTeX question imports without executing TeX', () => {
  it('parses exam choices and explicit CorrectChoice keys while preserving fractions and math delimiters', () => {
    const source = String.raw`\documentclass{exam}
\begin{document}\begin{questions}
\question Find \(\frac{1}{2}+\frac{1}{2}\).
\begin{choices}\choice $0$\CorrectChoice $1$\choice $2$\end{choices}
\question Select every correct value.
\begin{checkboxes}\CorrectChoice $2$\choice $3$\CorrectChoice $4$\end{checkboxes}
\end{questions}\end{document}`;
    const parsed = parseCbtLatex(source, { subject: 'Mathematics' });
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].prompt).toContain('$\\frac{1}{2}+\\frac{1}{2}$');
    expect(parsed.questions[0]).toMatchObject({ options: ['$0$', '$1$', '$2$'], correctAnswers: [1] });
    expect(parsed.questions[1]).toMatchObject({ kind: 'multiple', correctAnswers: [0, 2] });
  });
  it('separates nested enumerate choices from outer questions without losing their supplied keys', () => {
    const parsed = parseCbtLatex(String.raw`\begin{enumerate}
\item First \textbf{question}.
\begin{enumerate}[label=(\Alph*)]\item Red\item Blue\end{enumerate}
Answer: B
\item Next question.
\begin{enumerate}\item Small\item Large\end{enumerate}
\end{enumerate}`, { subject: 'Physics' });
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0]).toMatchObject({ prompt: 'First **question**.', options: ['Red', 'Blue'], correctAnswers: [1] });
    expect(parsed.questions[1].correctAnswers).toEqual([]);
  });
  it('carries a common stem into each exam part and never reads external commands', () => {
    const parsed = parseCbtLatex(String.raw`\question Use the following diagram. \includegraphics{private/diagram.png}
\begin{parts}
\part Find speed.\begin{choices}\choice Slow\CorrectChoice Fast\end{choices}
\part Find distance.\answer{12}\end{parts}`);
    expect(parsed.questions.map(q => q.sourceNumber)).toEqual(['1a', '1b']);
    expect(parsed.questions.every(q => q.prompt.includes('Use the following diagram.'))).toBe(true);
    expect(parsed.questions[0].prompt).toContain('[External LaTeX content omitted]');
    expect(parsed.questions[1]).toMatchObject({ kind: 'numeric', numericAnswer: 12 });
    expect(parsed.warnings[0]).toContain('not loaded or executed');
  });
  it('preserves escaped percentages and math text while stripping only real comments', () => {
    const parsed = parseCbtLatex(String.raw`\question Use $\text{mass}\,\frac{1}{2}$ and 50\% efficiency. % comment
\begin{choices}\choice A value\choice Another value\end{choices}`);
    expect(parsed.questions[0].prompt).toContain('$\\text{mass}\\,\\frac{1}{2}$');
    expect(parsed.questions[0].prompt).toContain('50% efficiency.');
    expect(parsed.questions[0].prompt).not.toContain('comment');
    expect(latexToStudyText(String.raw`\[x^2\]`)).toBe('$$\nx^2\n$$');
  });
  it('requires manual resolution when CorrectChoice disagrees with another supplied key', () => {
    const parsed = parseCbtLatex(String.raw`\question Choose a value.
\begin{choices}\CorrectChoice One\choice Two\end{choices}
Answer: B`, { subject: 'Physics' });
    expect(parsed.questions[0].correctAnswers).toEqual([]);
    expect(parsed.warnings[0]).toContain('Conflicting answer keys');
  });
  it('retains trailing keys when LaTeX contains ordinary numbered question text', () => {
    const parsed = parseCbtLatex(String.raw`\begin{document}
7. Calculate $x^2$.
A. One
B. Two
Answer key:
7: B
\end{document}`, { subject: 'Mathematics' });
    expect(parsed.questions[0]).toMatchObject({ sourceNumber: '7', correctAnswers: [1] });
  });
});
