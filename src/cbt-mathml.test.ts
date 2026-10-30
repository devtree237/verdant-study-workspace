import { describe, expect, it } from 'vitest';
import { protectCbtMathML, readCbtMathMLSnippet } from './cbt-mathml';
import { getCbtQuestionIssues, latexToStudyText, parseCbtLatex, parseCbtText } from './cbt-import';
import { parseLatexStructure } from './latex-ast';
import { mergeCbtAnswerKey, parseCbtAnswerKey } from './cbt-answer-key';
import { parseCbtSolutions } from './cbt-solutions';
import { scoreQuestion, validatePaper } from './testing-model';

const fraction = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
const chemistry = String.raw`$\ce{CaCO3 -> CaO + CO2}$`;
const file = (name: string, value: string | Uint8Array) => { const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }; };

describe('MathML in real CBT source structures', () => {
  it('preserves MathML question/option/explanation fragments with the supplied answer index', () => {
    const parsed = parseCbtText(`1. Choose ${fraction}\nA. ${fraction}\nB. 2\nAnswer: A\nExplanation: The supplied expression is ${fraction}`, { subject: 'Mathematics' });
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0]).toMatchObject({ prompt: `Choose ${fraction}`, options: [fraction, '2'], correctAnswers: [0], explanation: `The supplied expression is ${fraction}` });
    expect(getCbtQuestionIssues(parsed.questions[0])).toEqual([]);
  });
  it('does not treat numbered MathML text, option-like labels or key headings as question structure', () => {
    const inside = '<math><mtext>\n99. A label inside the expression\nA. not an option\nAnswer key:\n1: B\n</mtext></math>';
    const result = parseCbtText(`1. Inspect ${inside}\nA. Yes\nB. No\nAnswer: A\n2. Continue\nA. One\nB. Two\nAnswer: B`, { subject: 'Maths' });
    expect(result.questions.map(question => question.sourceNumber)).toEqual(['1', '2']);
    expect(result.questions[0]).toMatchObject({ prompt: `Inspect ${inside}`, options: ['Yes', 'No'], correctAnswers: [0] });
    expect(result.questions[1].correctAnswers).toEqual([1]);
  });
  it('keeps MathML opaque to the LaTeX AST, percent comments and chemistry macro cleanup', () => {
    const fragment = String.raw`<math><semantics><mi>x</mi><annotation encoding="application/x-tex">\textbf{50%}_{a}\item\section{Answer key}</annotation></semantics></math>`;
    const source = String.raw`% An ignored tag example: <math>
\begin{questions}\question Compare ` + fragment + ' with ' + chemistry + String.raw`.
\begin{choices}\CorrectChoice ` + fraction + String.raw`\choice 2\end{choices}\end{questions}`;
    const parsed = parseCbtLatex(source, { subject: 'Chemistry' });
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].prompt).toContain(fragment); expect(parsed.questions[0].prompt).toContain(chemistry);
    expect(parsed.questions[0]).toMatchObject({ options: [fraction, '2'], correctAnswers: [0] });
    const ast = parseLatexStructure(source);
    expect(ast.questions).toHaveLength(1); expect(ast.questions[0].source).toContain(fragment);
    expect(ast.questions[0].source).toContain(fraction);
    expect(latexToStudyText(String.raw`\textbf{Given }` + fraction + ' ' + chemistry)).toBe('**Given **' + fraction + ' ' + chemistry);
  });
  it('preserves supplied MathML solutions and ignores fake numbered keys inside their math text', () => {
    const explanation = `<math><mtext>\n9. Answer: B\n</mtext><mi>x</mi></math>`;
    const source = `1. Answer: A\nExplanation: The supplied result is ${explanation}`;
    const solutions = parseCbtSolutions(source, 'text');
    expect(solutions).toHaveLength(1); expect(solutions[0].explanation).toContain(explanation);
    const keys = parseCbtAnswerKey(source, 'text');
    expect(keys.entries).toHaveLength(1); expect(keys.entries[0]).toMatchObject({ sourceNumber: '1', answer: { kind: 'choice', labels: ['A'] } });
    expect(keys.entries[0].explanation).toContain(explanation);
    const questions = parseCbtText('1. Supplied stem\nA. First\nB. Second', { subject: 'Maths' }).questions;
    const merged = mergeCbtAnswerKey(questions, keys);
    expect(merged.questions[0].correctAnswers).toEqual([0]); expect(merged.questions[0].explanation).toContain(explanation);
  });
  it('does not manufacture a question or correct answer from an equation by itself', () => {
    expect(parseCbtText(fraction).questions).toEqual([]);
    expect(parseCbtLatex(fraction).questions).toEqual([]);
    expect(parseCbtAnswerKey(fraction).entries).toEqual([]);
    const missing = parseCbtText(`1. Inspect ${fraction}\nA. First\nB. Second`, { subject: 'Maths' }).questions[0];
    expect(missing.correctAnswers).toEqual([]); expect(getCbtQuestionIssues(missing)).toContain('Select the correct answer key.');
  });
  it('round-trips MathML in paper JSON and grades by the original canonical answer index', () => {
    const question = parseCbtText(`1. Choose ${fraction}\nA. ${fraction}\nB. 2\nAnswer: A`, { subject: 'Maths' }).questions[0];
    const paper = validatePaper(JSON.parse(JSON.stringify({ id: 'supplied-paper', title: 'User supplied questions', description: '', durationMinutes: 10, createdAt: 1, updatedAt: 1, questions: [question] })));
    expect(paper.questions[0].prompt).toContain(fraction); expect(paper.questions[0].options[0]).toBe(fraction);
    const response = { value: [0], visited: true, visits: 1, changes: 0, seconds: 20, markedReview: false };
    expect(scoreQuestion(paper.questions[0], response).status).toBe('correct');
    expect(scoreQuestion(paper.questions[0], { ...response, value: [1] }).status).toBe('incorrect');
  });
  it('uses collision-safe placeholders, quoted tag attributes and complete-fragment boundaries', () => {
    const source = 'VERDANTOPAQUEMATHML0TOKEN0END ' + fraction + ' <math alttext="a > b"><mi>x</mi></math>';
    const protectedSource = protectCbtMathML(source);
    expect(protectedSource.fragments).toHaveLength(2); expect(protectedSource.restore(protectedSource.source)).toBe(source);
    expect(() => protectCbtMathML('<math><mi>x</mi>')).toThrow('incomplete');
    expect(() => parseCbtLatex('1. Stem <math><mi>x</mi>')).toThrow('incomplete');
  });
  it('restores MathML source tags without leaking temporary parser placeholders', () => {
    const source = String.raw`\begin{enumerate}\item Supplied stem \qmeta{A}{Easy}{` + fraction + String.raw`}\begin{enumerate}[label=(\alph*)]\item One\item Two\end{enumerate}\end{enumerate}`;
    expect(parseLatexStructure(source).questions[0].metadata?.source).toBe(fraction);
    const parsed = parseCbtLatex(source, { subject: 'Maths' });
    expect(parsed.questions[0].sourceMetadata?.source).toBe(fraction);
    expect(JSON.stringify(parsed)).not.toContain('VERDANTOPAQUEMATHML');
  });
});

describe('bounded MathML equation snippet files', () => {
  it('accepts a safe UTF-8 .mml/.mathml snippet for editable source without inventing a paper', async () => {
    for (const extension of ['mml', 'mathml']) {
      const source = await readCbtMathMLSnippet(file(`supplied.${extension}`, fraction));
      expect(source).toContain('<mfrac>'); expect(parseCbtText(source).questions).toEqual([]);
    }
  });
  it('rejects arbitrary XML/HTML, unsafe markup, empty/large and invalid UTF-8 inputs', async () => {
    await expect(readCbtMathMLSnippet(file('paper.xml', fraction))).rejects.toThrow('General XML');
    await expect(readCbtMathMLSnippet(file('paper.mml', '<html><body>Not MathML</body></html>'))).rejects.toThrow();
    await expect(readCbtMathMLSnippet(file('paper.mml', '<math><mi onclick="alert(1)">x</mi></math>'))).rejects.toThrow();
    await expect(readCbtMathMLSnippet(file('paper.mml', '<!DOCTYPE math SYSTEM "https://invalid.test/external"><math><mi>x</mi></math>'))).rejects.toThrow();
    await expect(readCbtMathMLSnippet(file('empty.mml', ''))).rejects.toThrow('empty');
    await expect(readCbtMathMLSnippet(file('large.mml', 'x'.repeat(1024 * 1024 + 1)))).rejects.toThrow('1 MB');
    await expect(readCbtMathMLSnippet(file('bad.mml', Uint8Array.from([0xc3, 0x28])))).rejects.toThrow('UTF-8');
  });
});
