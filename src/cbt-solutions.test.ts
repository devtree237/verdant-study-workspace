import { describe, expect, it } from 'vitest';
import { parseCbtSolutions } from './cbt-solutions';
import { parseCbtAnswerKey, mergeCbtAnswerKey } from './cbt-answer-key';
import { parseCbtLatex } from './cbt-import';
import { validateCbtPdfRange } from './cbt-pdf';

describe('supplied solutions',()=>{
  it('reads labelled solution paragraphs and retains math',()=>{
    const source = String.raw`\begin{questionblock}{1}\textbf{Answer C | M}\par Since $x^2=4$, $x=2$.\end{questionblock}
\begin{questionblock}{2}\textbf{Ans: (a)}\par Explanation: The supplied explanation.\end{questionblock}`;
    expect(parseCbtSolutions(source,'latex')).toEqual([{sourceNumber:'1',key:'C',explanation:'Since $x^2=4$, $x=2$.'},{sourceNumber:'2',key:'(a)',explanation:'The supplied explanation.'}]);
    expect(parseCbtAnswerKey(source,'latex').entries.every(entry=>!!entry.explanation)).toBe(true);
  });
  it('does not interpret ordinary numbered prose as solutions or answers',()=>{
    expect(parseCbtSolutions('1. Choose the best answer.\nA) A supplied option\n2. Write a revision rule.')).toEqual([]);
  });
  it('supports explanation-only supplements without guessing keys',()=>{
    const paper=String.raw`\begin{enumerate}\item Real stem\begin{enumerate}[label=(\alph*)]\item One\item Two\item Three\item Four\end{enumerate}\end{enumerate}`;
    const draft=parseCbtLatex(paper,{subject:'Maths'}).questions;
    const merged=mergeCbtAnswerKey(draft,parseCbtAnswerKey('1. Explanation: Supplied reasoning.'));
    expect(merged.questions[0].explanation).toBe('Supplied reasoning.');
    expect(merged.questions[0].correctAnswers).toEqual([]);
    expect(merged.solutionsApplied).toBe(1);
  });
  it('leaves conflicting duplicate solutions unapplied',()=>{
    const parsed=parseCbtAnswerKey('1. Answer: A\nExplanation: First solution.\n1. Answer: A\nExplanation: Second solution.');
    expect(parsed.entries[0].solutionConflict).toBe(true);
    expect(parsed.entries[0].explanation).toBeUndefined();
  });
  it('validates selected PDF page bounds',()=>{
    expect(validateCbtPdfRange({from:2,to:4},8)).toEqual({from:2,to:4});
    for(const range of [{from:0,to:4},{from:3,to:2},{from:1,to:9},{from:1.5,to:2}])expect(()=>validateCbtPdfRange(range,8)).toThrow();
  });
  it('preserves offsets in Windows LaTeX sources',()=>{
    const source='\\begin{document}\r\n\\begin{questionblock}{1}\\textbf{Answer A | M}\\par Supplied explanation.\\end{questionblock}\r\n\\end{document}';
    expect(parseCbtSolutions(source,'latex')).toEqual([{sourceNumber:'1',key:'A',explanation:'Supplied explanation.'}]);
  });
  it('recovers explicit answer headers with a producer-escaped tab and reports it',()=>{
    const source='\\begin{questionblock}{1}\textbf{Answer C | M}\\par Supplied explanation.\\end{questionblock}';
    const parsed=parseCbtAnswerKey(source,'latex');
    expect(parsed.entries[0]).toMatchObject({answer:{kind:'choice',labels:['C']},explanation:'Supplied explanation.'});
    expect(parsed.warnings.some(warning=>warning.includes('malformed TAB'))).toBe(true);
  });
  it('respects enumerate start and setcounter without treating nested statements as solutions',()=>{
    const source=String.raw`\begin{enumerate}[start=16]\item Answer: C\par Supplied sixteen.\begin{enumerate}\item Explanation: A nested step.\end{enumerate}\item Answer: A\par Supplied seventeen.\end{enumerate}
\begin{enumerate}\setcounter{enumi}{29}\item Answer: D\par Supplied thirty.\end{enumerate}`;
    expect(parseCbtSolutions(source,'latex').map(item=>[item.sourceNumber,item.key])).toEqual([['16','C'],['17','A'],['30','D']]);
  });
  it('keeps numbered working and page continuations inside the supplied solution',()=>{
    const result=parseCbtSolutions('1. Answer: B\nExplanation: Start here.\n1. Substitute the value.\n[Page 3]\n2. Simplify the expression.\n2. Answer: C\nExplanation: Next question.');
    expect(result).toHaveLength(2);
    expect(result[0].explanation).toContain('2. Simplify the expression.');
    expect(result[0].explanation).not.toContain('[Page');
  });
});
