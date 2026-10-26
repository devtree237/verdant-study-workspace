import { describe, expect, it } from 'vitest';
import { getCbtQuestionIssues, latexToStudyText, parseCbtAnswerTokens, parseCbtLatex, parseCbtText } from './cbt-import';

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
  it('strictly reads complete multi-answer tokens without accepting partial explanatory answers', () => {
    for (const answer of ['AC', 'A C', '(A)(C)', '(A) (C)', 'A,C', 'A / C', 'A&C', 'A and C']) expect(parseCbtAnswerTokens(answer)).toEqual(['A', 'C']);
    for (const answer of ['', 'A or C', 'A, C because', 'A (see explanation)', '(AB)', 'A,,C', 'A U', '2']) expect(parseCbtAnswerTokens(answer)).toBeNull();
    const parsed = parseCbtText('1. Choose values\nA. One\nB. Two\nC. Three\nAnswer key:\n1: A or C', { subject: 'Mathematics' });
    expect(parsed.questions[0].correctAnswers).toEqual([]);
    expect(parsed.warnings[0]).toContain('not recognized');
  });
  it('keeps explicitly declared multiple-answer questions multiple even with one supplied answer', () => {
    for (const kind of ['multiple', 'multiple correct', 'multi-select']) {
      const parsed = parseCbtText('1. Choose values\nType: ' + kind + '\nA. One\nB. Two\nAnswer: A', { subject: 'Mathematics' });
      expect(parsed.questions[0]).toMatchObject({ kind: 'multiple', correctAnswers: [0] });
    }
  });
  it('reorders a row-major option grid by explicit complete labels without detaching content or keys', () => {
    const parsed = parseCbtText('1. Select values\nA. Alpha   C. Gamma\nB. Beta   D. Delta\nAnswer: AC', { subject: 'Mathematics' });
    expect(parsed.questions[0]).toMatchObject({ options: ['Alpha', 'Beta', 'Gamma', 'Delta'], sourceOptionLabels: ['A', 'B', 'C', 'D'], correctAnswers: [0, 2], kind: 'multiple' });
  });
  it('does not split single-spaced prose references, lower-case prose, or math into answer options', () => {
    const parsed = parseCbtText('1. Compare statement (A) and statement (C) in $A. x + B. y$.\nThe term a. is prose.\nA. First $C. z + D. w$\nB. Second\nAnswer: B', { subject: 'Mathematics' });
    expect(parsed.questions[0].prompt).toBe('Compare statement (A) and statement (C) in $A. x + B. y$.\nThe term a. is prose.');
    expect(parsed.questions[0].options).toEqual(['First $C. z + D. w$', 'Second']);
  });
  it('warns on repeated labels and never applies an ambiguous letter key', () => {
    const parsed = parseCbtText('1. Choose one\nA. First\nA. Second\nAnswer: A', { subject: 'Physics' });
    expect(parsed.questions[0].sourceOptionLabels).toEqual(['A', 'A']);
    expect(parsed.questions[0].correctAnswers).toEqual([]);
    expect(parsed.warnings[0]).toContain('repeated or incomplete option labels');
  });
  it('keeps sample-table A:/B: rows in the stem and letter-named prose inside answer options', () => {
    const parsed = parseCbtText('5. Interpret the data.\nSample    Initial pH\nA: no addition    6.4\nB: baking soda added    7.5\n(A) First interpretation\n(B) Second interpretation\n(C) Third interpretation\n(D) Fourth interpretation\n25. Choose treatments for A and B.\n(A) A: heat without air; B: heat in excess air.\n(B) A: heat in excess air; B: heat without air.\n(C) A and B: dissolve in water.\n(D) A and B: convert to chloride.', { subject: 'Chemistry' });
    expect(parsed.questions.map(q => q.options.length)).toEqual([4, 4]);
    expect(parsed.questions[0].prompt).toContain('B: baking soda added    7.5');
    expect(parsed.questions[1].options[0]).toBe('A: heat without air; B: heat in excess air.');
  });
  it('does not interpret a Q-labelled table row as a whitespace-separated question marker', () => {
    const parsed = parseCbtText('Q12. Interpret the bottles.\nBottle    Approximate pH    Gas with dilute HCl\nP    7    None\nQ    11    CO2\nR    5    None\n(A) One\n(B) Two\nQ13 Next question\n(A) Red\n(B) Blue\nQuestion 14 Last question\n(A) Yes\n(B) No\nQ 15. Explicit separated Q marker\n(A) Large\n(B) Small', { subject: 'Chemistry' });
    expect(parsed.questions.map(q => q.sourceNumber)).toEqual(['12', '13', '14', '15']);
    expect(parsed.questions[0].prompt).toContain('Q    11    CO2');
    expect(parsed.questions.every(q => q.options.length === 2)).toBe(true);
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
  it('prioritizes explicit numbered questionblocks over their inner options lists', () => {
    const parsed = parseCbtLatex(String.raw`\begin{document}
\begin{questionblock}{7}First actual question.
\begin{enumerate}\item One\item Two\item Three\item Four\end{enumerate}\end{questionblock}
\begin{questionblock}{12}Next actual question.
\begin{enumerate}\item Red\item Blue\item Green\item Yellow\end{enumerate}\end{questionblock}
\end{document}`, { subject: 'Chemistry' });
    expect(parsed.questions.map(q => q.sourceNumber)).toEqual(['7', '12']);
    expect(parsed.questions.map(q => q.options.length)).toEqual([4, 4]);
    expect(parsed.questions.map(q => q.correctAnswers)).toEqual([[], []]);
    expect(parsed.questions[0].prompt).toBe('First actual question.');
  });
  it('keeps all outer questions across explicit column lists and honors supplied enumerate start numbers', () => {
    const parsed = parseCbtLatex(String.raw`\begin{multicols}{2}
\begin{enumerate}\item First question.\begin{enumerate}\item One\item Two\end{enumerate}\end{enumerate}
\columnbreak
\begin{enumerate}[start=2]\item Second question.\begin{enumerate}\item Red\item Blue\end{enumerate}\end{enumerate}
\end{multicols}`, { subject: 'Physics' });
    expect(parsed.questions.map(q => q.sourceNumber)).toEqual(['1', '2']);
    expect(parsed.questions.map(q => q.options)).toEqual([['One', 'Two'], ['Red', 'Blue']]);
    expect(parsed.warnings[0]).toContain('source order');
  });
  it('does not reinterpret an incomplete questionblock options list as independent questions', () => {
    const parsed = parseCbtLatex(String.raw`\begin{questionblock}{7}An incomplete question.
\begin{enumerate}\item One\item Two\end{enumerate}`);
    expect(parsed.questions).toEqual([]);
    expect(parsed.warnings[0]).toContain('questionblock containers are incomplete');
  });
  it('reads case variants of CorrectChoice and starred list items without guessing what stars mean', () => {
    const parsed = parseCbtLatex(String.raw`\question Select values.\begin{checkboxes}\correctchoice One\choice Two\CorrectChoice Three\end{checkboxes}
\question Choose one.\begin{enumerate}\item* Alpha\item Beta\end{enumerate}`, { subject: 'Physics' });
    expect(parsed.questions[0]).toMatchObject({ kind: 'multiple', correctAnswers: [0, 2] });
    expect(parsed.questions[1]).toMatchObject({ options: ['Alpha', 'Beta'], correctAnswers: [] });
    expect(parsed.warnings[0]).toContain('Stars are formatting only');
  });
  it('converts a simple stem table while preserving math, column alignment, source labels and supplied keys', () => {
    const parsed = parseCbtLatex(String.raw`\begin{questionblock}{7}Use the table.
\begin{center}\small\begin{tabular}{lcr}
\toprule\textbf{Solution} & \textbf{P} & \textbf{Q} \\ \midrule
pH & $\frac{1}{2}$ & \(5\) \\
\bottomrule\end{tabular}\end{center}
\begin{enumerate}\item[A] One\item[C] Three\item[B] Two\end{enumerate}
\end{questionblock}
Answer key:
7: (A)(C)`, { subject: 'Chemistry' });
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].prompt).toContain('| **Solution** | **P** | **Q** |\n| :--- | :---: | ---: |\n| pH | $\\frac{1}{2}$ | $5$ |');
    expect(parsed.questions[0].prompt).not.toContain('tabular');
    expect(parsed.questions[0]).toMatchObject({ sourceNumber: '7', sourceOptionLabels: ['A', 'B', 'C'], options: ['One', 'Two', 'Three'], correctAnswers: [0, 2] });
  });
  it('preserves every data row when a simple longtable has no explicit header', () => {
    const rendered = latexToStudyText(String.raw`\begin{longtable}{lc}A & $1$ \\ B & $2$ \\\end{longtable}`);
    expect(rendered).toBe('|  |  |\n| :--- | :---: |\n| A | $1$ |\n| B | $2$ |');
  });
  it('retains complex or mismatched tables verbatim with a warning instead of inventing cells', () => {
    for (const table of [String.raw`\begin{tabular}{ll}One & Two \\ Only one cell \\\end{tabular}`, String.raw`\begin{tabular}{ll}\multicolumn{2}{c}{Merged} \\\end{tabular}`]) {
      const warnings: string[] = [], rendered = latexToStudyText(table, warnings);
      expect(rendered).toContain(table);
      expect(rendered.startsWith('```tex')).toBe(true);
      expect(warnings).toEqual(['A complex or mismatched LaTeX table was kept as source. Review its cells manually; no rows or columns were guessed.']);
    }
  });
  it('separates Roman and numeric stem statements from alphabetic options using AST depth', () => {
    const parsed = parseCbtLatex(String.raw`\documentclass{article}
\newcommand{\qmeta}[3]{unused decoration}
\begin{document}\begin{enumerate}
\item \textbf{Classify the statements} \qmeta{D}{Medium}{Actual source tag}\\
\begin{itemize}\item[(I)] First statement with $\ce{CaCO3}$.
\item[(II)] Second statement.
\item[(IV)] Fourth statement.\end{itemize}
\begin{enumerate}[label=(\arabic*)]\item Numeric statement\item Another statement\end{enumerate}
\begin{multicols}{4}\begin{enumerate}[label=(\alph*)]
\item[(a)] I only\item[(b)] II only\item[(c)] I and II\item[(d)] IV only
\end{enumerate}\end{multicols}\end{enumerate}\end{document}`, { subject: 'Chemistry' });
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].options).toEqual(['I only', 'II only', 'I and II', 'IV only']);
    expect(parsed.questions[0].prompt).toContain('(I) First statement');
    expect(parsed.questions[0].prompt).toContain('(IV) Fourth statement.');
    expect(parsed.questions[0].prompt).toContain('Numeric statement');
    expect(parsed.questions[0].prompt).toContain('$\\ce{CaCO3}$');
    expect(parsed.questions[0]).toMatchObject({ sourceMetadata: { competency: 'D', difficulty: 'Medium', source: 'Actual source tag' }, difficulty: 'Moderate', correctAnswers: [] });
    expect(parsed.questions[0].prompt).not.toContain('qmeta');
    expect(parsed.questions[0].prompt).not.toContain('unused decoration');
  });
  it('continues question numbering with setcounter across sections and stops before all key/solution questions', () => {
    const question = String.raw`\item Actual prompt.\begin{enumerate}[label=(\alph*)]\item A value\item B value\item C value\item D value\end{enumerate}`;
    const source = String.raw`\begin{document}\section*{SECTION A}\begin{enumerate}` + question.repeat(15) + String.raw`\end{enumerate}\section*{SECTION B}\begin{enumerate}\setcounter{enumi}{15}` + question.repeat(15) + String.raw`\end{enumerate}\section*{SECTION C: ANSWER KEY}\begin{enumerate}\item This is a key, never a question.\end{enumerate}\section*{SOLUTIONS}\begin{enumerate}\item This is an explanation.\end{enumerate}\end{document}`;
    const parsed = parseCbtLatex(source, { subject: 'Chemistry' });
    expect(parsed.questions.map(q => q.sourceNumber)).toEqual(Array.from({ length: 30 }, (_, index) => String(index + 1)));
    expect(parsed.questions.every(q => q.options.length === 4 && q.correctAnswers.length === 0)).toBe(true);
    expect(parsed.embeddedSource).toBe(source.slice(source.indexOf('\\section*{SECTION C')));
    expect(parsed.questions.some(q => q.prompt.includes('explanation.'))).toBe(false);
  });
  it('stops at formatted key banners while preserving mentions of solutions within a question', () => {
    const parsed = parseCbtLatex(String.raw`\begin{enumerate}\item Compare the acid solutions.
\begin{enumerate}[label=(\alph*)]\item One\item Two\end{enumerate}\end{enumerate}
\begin{center}{\Large\textbf{SELF-ANALYSIS}}\end{center}
\begin{enumerate}\item Not a test question.\end{enumerate}`, { subject: 'Chemistry' });
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].prompt).toContain('acid solutions');
    expect(parsed.embeddedSource).toContain('SELF-ANALYSIS');
  });
  it('binds only the explicit preceding Assertion–Reason directions, without inventing standard definitions or keys', () => {
    const question = String.raw`\begin{enumerate}\item Assertion: A stated claim. Reason: Its stated reason.
\begin{enumerate}[label=(\alph*)]\item Option (a)\item Option (b)\item Option (c)\item Option (d)\end{enumerate}\end{enumerate}`;
    const parsed = parseCbtLatex(String.raw`\textbf{Directions for Assertion–Reason questions}
\begin{enumerate}[label=(\alph*)]\item Both true, reason explains assertion.\item Both true, reason does not explain assertion.\item Assertion true, reason false.\item Assertion false, reason true.\end{enumerate}` + question, { subject: 'Chemistry' });
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].options[0]).toBe('Both true, reason explains assertion.');
    expect(parsed.questions[0].options[3]).toBe('Assertion false, reason true.');
    expect(parsed.questions[0].correctAnswers).toEqual([]);
    const withoutDirections = parseCbtLatex(question, { subject: 'Chemistry' });
    expect(withoutDirections.questions[0].options).toEqual(['Option (a)', 'Option (b)', 'Option (c)', 'Option (d)']);
    expect(withoutDirections.warnings[0]).toContain('no explicit preceding');
  });
  it('supports simple tabularx and preserves align mathematics for KaTeX without executing chemistry macros', () => {
    const parsed = parseCbtLatex(String.raw`\begin{enumerate}\item Use this data.
\begin{tabularx}{\linewidth}{lX}\toprule\textbf{Material} & \textbf{Formula}\\\midrule
Salt & $\ce{CaSO4}\cdot\frac{1}{2}\text{H}_2\text{O}$\\\bottomrule\end{tabularx}
\begin{align*}x&=\frac{1}{2}\\y&\xrightarrow{\Delta}z\end{align*}
\begin{enumerate}[label=(\alph*)]\item One\item Two\end{enumerate}\end{enumerate}`, { subject: 'Chemistry' });
    expect(parsed.questions[0].prompt).toContain('| **Material** | **Formula** |');
    expect(parsed.questions[0].prompt).toContain('$\\ce{CaSO4}\\cdot\\frac{1}{2}\\text{H}_2\\text{O}$');
    expect(parsed.questions[0].prompt).toContain('$$\n\\begin{aligned}');
    expect(parsed.questions[0].prompt).toContain('y&\\xrightarrow{\\Delta}z');
    expect(parsed.questions[0].options).toEqual(['One', 'Two']);
  });
});
