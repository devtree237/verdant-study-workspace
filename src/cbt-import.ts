import type { Difficulty, TestQuestion } from './testing-model';

export type CbtImportDefaults = { subject: string; marks: number; negativeMarks: number; idealSeconds: number; difficulty: Difficulty };
export type CbtDraftQuestion = TestQuestion & { sourceNumber: string; sourcePage?: number };
export type CbtParseResult = { questions: CbtDraftQuestion[]; warnings: string[] };
const defaults: CbtImportDefaults = { subject: '', marks: 4, negativeMarks: 1, idealSeconds: 120, difficulty: 'Moderate' };
const MAX_SOURCE = 4_000_000;
const normalizeNumber = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function safeSource(source: string): string {
  if (source.length > MAX_SOURCE) throw new Error('This source is too large. Split it into smaller papers.');
  return source.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/\u00a0/g, ' ');
}
function answerKey(source: string): { body: string; keys: Map<string, string>; conflicts: Set<string>; warnings: string[] } {
  const heading = /^[ \t]*(?:answer[ \t]*key|answer[ \t]*sheet|answers(?=[ \t]*[:：]?[ \t]*(?:\d|$)))[ \t]*[:：]?[ \t]*(.*)$/im.exec(source);
  if (!heading) return { body: source, keys: new Map(), conflicts: new Set(), warnings: [] };
  const tail = heading[1] + '\n' + source.slice(heading.index + heading[0].length), keys = new Map<string, string>(), conflicts = new Set<string>(), warnings: string[] = [];
  const entry = /(?:^|[\s;,])(?:Q(?:uestion)?\s*)?(\d+(?:\s*\(?[a-z]\)?)?)\s*[).:=\-]\s*([A-T](?:\s*(?:[,/&+]|\band\b)\s*[A-T])*|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:\s*(?:±|\+\/-)\s*\d*\.?\d+)?)\b/gi;
  for (const match of tail.matchAll(entry)) {
    const id = normalizeNumber(match[1]);
    if (conflicts.has(id)) continue;
    if (keys.has(id) && canonicalKey(keys.get(id)!) !== canonicalKey(match[2])) {
      warnings.push('Conflicting answer keys for question ' + match[1] + '. Select the correct answer manually during review.');
      keys.delete(id); conflicts.add(id);
    } else keys.set(id, match[2]);
  }
  if (!keys.size && !conflicts.size) warnings.push('An answer-key section was found, but its entries were not recognized. Add the correct answers during review.');
  return { body: source.slice(0, heading.index), keys, conflicts, warnings };
}
function numericKey(raw: string): { value: number; tolerance: number } | null {
  const match = raw.trim().replace(/^\$|\$$/g, '').match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:\s*(?:±|\+\/-)\s*(\d*\.?\d+))?$/i);
  return match && Number.isFinite(Number(match[1])) ? { value: Number(match[1]), tolerance: Number(match[2] || 0) } : null;
}
function canonicalKey(raw: string): string {
  const number = numericKey(raw);
  if (number) return 'number:' + number.value + ':' + number.tolerance;
  return [...new Set(raw.trim().toUpperCase().split(/\s*(?:[,/&+]|\bAND\b)\s*/))].sort().join(',');
}
function resolveKey(candidates: (string | undefined)[], number: string, warnings: string[]): string | undefined {
  const supplied = candidates.filter((value): value is string => !!value?.trim());
  if (new Set(supplied.map(canonicalKey)).size > 1) {
    warnings.push('Conflicting answer keys for question ' + number + '. Select the correct answer manually during review.');
    return;
  }
  return supplied[0];
}
function applyKey(question: CbtDraftQuestion, raw: string | undefined, labels: string[]) {
  if (!raw) return;
  const value = raw.trim();
  if (question.kind === 'numeric' || !question.options.length) {
    const number = numericKey(value);
    if (number) { question.kind = 'numeric'; question.options = []; question.correctAnswers = []; question.numericAnswer = number.value; question.tolerance = number.tolerance; }
    return;
  }
  if (!/^[A-T](?:\s*(?:[,/&+]|\band\b)\s*[A-T])*$/i.test(value)) return;
  const letters = value.toUpperCase().split(/\s*(?:[,/&+]|\bAND\b)\s*/).filter(Boolean), selected = letters.map(letter => labels.indexOf(letter));
  if (selected.some(index => index < 0)) return;
  question.correctAnswers = [...new Set(selected)].sort((a, b) => a - b);
  if (question.correctAnswers.length > 1) question.kind = 'multiple';
}
function fresh(number: string, config: CbtImportDefaults, page?: number): CbtDraftQuestion {
  return { id: crypto.randomUUID(), sourceNumber: number, ...(page ? { sourcePage: page } : {}), prompt: '', subject: config.subject, chapter: '', topic: '', difficulty: config.difficulty, kind: 'single', options: [], correctAnswers: [], marks: config.marks, negativeMarks: config.negativeMarks, idealSeconds: config.idealSeconds, explanation: '' };
}
function parseBlock(source: string, number: string, config: CbtImportDefaults, key?: string, page?: number, context: { warnings?: string[]; conflict?: boolean; options?: string[]; key?: string; multiple?: boolean } = {}): CbtDraftQuestion {
  const question = fresh(number, config, page);
  const candidateKeys = [key, context.key];
  const lines: string[] = [];
  let explanation = false;
  for (const line of source.split('\n')) {
    const answer = /^\s*(?:correct\s*answers?|answers?|key)\s*[:：=]\s*(.+)$/i.exec(line);
    if (answer) { candidateKeys.push(answer[1]); continue; }
    const solution = /^\s*(?:solution|explanation)\s*[:：]\s*(.*)$/i.exec(line);
    if (solution) { explanation = true; if (solution[1]) question.explanation += solution[1]; continue; }
    if (explanation) { question.explanation += '\n' + line; continue; }
    const meta = /^\s*(subject|chapter|topic|difficulty|marks|negative\s*marks|ideal\s*seconds|type)\s*[:：]\s*(.+)$/i.exec(line);
    if (meta) {
      const name = meta[1].toLowerCase().replace(/\s+/g, ''), value = meta[2].trim();
      if (name === 'subject' || name === 'chapter' || name === 'topic') question[name] = value;
      else if (name === 'difficulty' && ['easy', 'moderate', 'tough'].includes(value.toLowerCase())) question.difficulty = (value[0].toUpperCase() + value.slice(1).toLowerCase()) as Difficulty;
      else if (name === 'type' && /numeric|numerical|integer/i.test(value)) question.kind = 'numeric';
      else if (['marks', 'negativemarks', 'idealseconds'].includes(name)) question[name === 'marks' ? 'marks' : name === 'negativemarks' ? 'negativeMarks' : 'idealSeconds'] = Number(value);
      continue;
    }
    if (!/^\s*\[Page\s+\d+\]\s*$/i.test(line)) lines.push(line);
  }
  const content = lines.join('\n').trim();
  const options = [...content.matchAll(/(?:^|\s)(?:\(([A-T])\)|([A-T])[).:])\s+/gim)];
  const usable = options.length >= 2 || (options.length === 1 && (options[0][1] || options[0][2]).toUpperCase() === 'A');
  const labels: string[] = [];
  if (context.options) {
    question.prompt = content; question.options = context.options; question.kind = context.multiple ? 'multiple' : 'single';
    labels.push(...context.options.map((_, index) => String.fromCharCode(65 + index)));
  } else if (usable) {
    question.prompt = content.slice(0, options[0].index).trim();
    options.forEach((match, index) => { labels.push((match[1] || match[2]).toUpperCase()); question.options.push(content.slice(match.index! + match[0].length, options[index + 1]?.index ?? content.length).trim()); });
  } else question.prompt = content;
  const explicitKey = context.conflict ? undefined : resolveKey(candidateKeys, number, context.warnings || []);
  if (!question.options.length && explicitKey && numericKey(explicitKey)) question.kind = 'numeric';
  applyKey(question, explicitKey, labels);
  question.explanation = question.explanation.trim();
  return question;
}

export function parseCbtText(input: string, options: Partial<CbtImportDefaults> = {}): CbtParseResult {
  const source = safeSource(input), config = { ...defaults, ...options }, { body, keys, conflicts, warnings } = answerKey(source);
  const markers = [...body.matchAll(/^\s*(?:(?:Q(?:uestion)?\.?\s*)(\d+)\s*[).:：\-]?\s+|(\d+)\s*[).:：\-]\s+)(.*)$/gim)];
  if (!markers.length) return { questions: [], warnings: [...warnings, 'No numbered questions were recognized. Add clear question numbers and option labels in the extracted text, then parse again.'] };
  if (markers.length > 1000) throw new Error('A paper may contain at most 1,000 questions. Split this source.');
  const questions = markers.map((match, index) => {
    const number = match[1] || match[2], start = match.index! + match[0].length - match[3].length, raw = body.slice(start, markers[index + 1]?.index ?? body.length);
    const before = body.slice(0, match.index), pages = [...before.matchAll(/^\s*\[Page\s+(\d+)\]\s*$/gim)];
    return parseBlock(raw, number, config, keys.get(normalizeNumber(number)), pages.length ? Number(pages.at(-1)![1]) : undefined, { warnings, conflict: conflicts.has(normalizeNumber(number)) });
  });
  if (new Set(questions.map(question => question.sourceNumber)).size !== questions.length) warnings.push('Question numbers repeat in this source. Check section boundaries and answer-key mapping carefully.');
  if ([...keys.keys()].some(number => !questions.some(question => normalizeNumber(question.sourceNumber) === number))) warnings.push('Some answer-key entries do not match a recognized question number.');
  return { questions, warnings };
}

function stripComments(source: string) {
  return source.split('\n').map(line => { for (let index = 0; index < line.length; index++) if (line[index] === '%') { let slashes = 0; for (let previous = index - 1; previous >= 0 && line[previous] === '\\'; previous--) slashes++; if (slashes % 2 === 0) return line.slice(0, index); } return line; }).join('\n');
}
function braced(source: string, start: number): { value: string; end: number } | null {
  if (source[start] !== '{') return null;
  let depth = 1;
  for (let index = start + 1; index < source.length; index++) { if (source[index] === '\\') { index++; continue; } if (source[index] === '{') depth++; if (source[index] === '}' && !--depth) return { value: source.slice(start + 1, index), end: index + 1 }; }
  return null;
}
/** Converts presentation syntax only; TeX is never compiled, expanded, or allowed to fetch referenced files. */
export function latexToStudyText(input: string): string {
  let source = input.replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => '$$\n' + math + '\n$$').replace(/\\\(([\s\S]*?)\\\)/g, (_, math: string) => '$' + math + '$');
  source = source.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_, math: string) => '$$\n' + math + '\n$$');
  return source.split(/(\$\$[\s\S]*?\$\$|\$(?:\\.|[^$])*\$)/g).map((part, index) => {
    if (index % 2) return part;
    let text = part;
    for (let pass = 0; pass < 8; pass++) {
      const match = /\\(textbf|textit|emph|underline|textnormal|textrm|textsf|texttt)\s*\{/.exec(text);
      if (!match) break;
      const group = braced(text, match.index + match[0].length - 1); if (!group) break;
      const wrap = match[1] === 'textbf' ? '**' : ['textit', 'emph'].includes(match[1]) ? '*' : '';
      text = text.slice(0, match.index) + wrap + group.value + wrap + text.slice(group.end);
    }
    return text.replace(/\\(?:par|newline)\b/g, '\n\n').replace(/\\\\(?:\[[^\]]*\])?/g, '\n').replace(/\\(?:noindent|smallskip|medskip|bigskip)\b/g, '').replace(/\\([%&#_])/g, '$1').replace(/~/g, ' ').replace(/\\(?:begin|end)\{(?:questions|parts|document|center)\}/g, '');
  }).join('').trim();
}
function environment(source: string, name: string): { start: number; end: number; inner: string } | null {
  const pattern = new RegExp('\\\\(begin|end)\\{' + name + '\\}(?:\\[[^\\]]*\\])?', 'g'); let depth = 0, start = -1, contentStart = 0;
  for (const match of source.matchAll(pattern)) { if (match[1] === 'begin') { if (!depth) { start = match.index!; contentStart = start + match[0].length; } depth++; } else if (depth && !--depth) return { start, end: match.index! + match[0].length, inner: source.slice(contentStart, match.index) }; }
  return null;
}
function topItems(source: string): { label: string; body: string }[] {
  const tokens = /\\(?:begin\{([^}]+)\}|end\{([^}]+)\}|item\b(?:\[([^\]]*)\])?)/g, markers: { start: number; end: number; label: string }[] = [];
  let depth = 0;
  for (const token of source.matchAll(tokens)) { if (token[1]) depth++; else if (token[2]) depth = Math.max(0, depth - 1); else if (!depth) markers.push({ start: token.index!, end: token.index! + token[0].length, label: token[3] || '' }); }
  return markers.map((marker, index) => ({ label: marker.label, body: source.slice(marker.end, markers[index + 1]?.start ?? source.length) }));
}
function latexBlock(raw: string, number: string, config: CbtImportDefaults, key?: string, warnings: string[] = [], conflict = false): CbtDraftQuestion {
  let source = raw.replace(/\\(?:answer|correctanswer)\s*\{([^}]*)\}/gi, '\nAnswer: $1\n');
  const solution = environment(source, 'solution'); let explanation = '';
  if (solution) { explanation = latexToStudyText(solution.inner); source = source.slice(0, solution.start) + source.slice(solution.end); }
  const choices = /\\begin\{(choices|oneparchoices|checkboxes|oneparcheckboxes)\}([\s\S]*?)\\end\{\1\}/.exec(source);
  const nested = choices ? null : environment(source, 'enumerate');
  let prompt = source, optionTexts: string[] = [], explicitCorrect: number[] = [];
  if (choices) {
    const markers = [...choices[2].matchAll(/\\(CorrectChoice|choice)\b/g)];
    optionTexts = markers.map((marker, index) => { if (marker[1] === 'CorrectChoice') explicitCorrect.push(index); return latexToStudyText(choices[2].slice(marker.index! + marker[0].length, markers[index + 1]?.index ?? choices[2].length)); });
    prompt = source.slice(0, choices.index) + source.slice(choices.index! + choices[0].length);
  } else if (nested) { optionTexts = topItems(nested.inner).map(item => latexToStudyText(item.body)); prompt = source.slice(0, nested.start) + source.slice(nested.end); }
  const parsed = parseBlock(latexToStudyText(prompt), number, config, key, undefined, {
    warnings, conflict, ...(optionTexts.length ? { options: optionTexts, multiple: choices?.[1].includes('checkboxes') } : {}),
    key: explicitCorrect.length ? explicitCorrect.map(index => String.fromCharCode(65 + index)).join(',') : undefined,
  });
  if (explanation) parsed.explanation = explanation;
  return parsed;
}
export function parseCbtLatex(input: string, options: Partial<CbtImportDefaults> = {}): CbtParseResult {
  let source = stripComments(safeSource(input)); const warnings: string[] = [], config = { ...defaults, ...options };
  if (/\\(?:input|include|includegraphics|write18|openout|openin|read|href|url)\b/.test(source)) warnings.push('External files, images, links, and executable LaTeX commands are not loaded or executed. Add any missing image content manually.');
  source = source.replace(/\\(?:input|include|includegraphics|write18|openout|openin|read|href|url)\b(?:\[[^\]]*\])?\s*\{[^}]*\}(?:\{[^}]*\})?/g, '[External LaTeX content omitted]');
  const document = environment(source, 'document'); if (document) source = document.inner;
  const fallbackSource = latexToStudyText(source), key = answerKey(fallbackSource);
  // Keep source structure for parsing; remove only a trailing plain answer-key section.
  const keyHeading = /^[ \t]*(?:answer[ \t]*key|answer[ \t]*sheet|answers(?=[ \t]*[:：]?[ \t]*(?:\d|$)))[ \t]*[:：]?/im.exec(source); if (keyHeading) source = source.slice(0, keyHeading.index);
  const markers = [...source.matchAll(/\\question\b(?:\[[^\]]*\])?/g)], questions: CbtDraftQuestion[] = [];
  if (markers.length) markers.forEach((marker, index) => {
    const body = source.slice(marker.index! + marker[0].length, markers[index + 1]?.index ?? source.length), parts = environment(body, 'parts');
    if (parts) {
      const stem = body.slice(0, parts.start), items = [...parts.inner.matchAll(/\\part\b(?:\[[^\]]*\])?/g)];
      items.forEach((item, partIndex) => { const number = (index + 1) + String.fromCharCode(97 + partIndex); questions.push(latexBlock(stem + '\n' + parts.inner.slice(item.index! + item[0].length, items[partIndex + 1]?.index ?? parts.inner.length), number, config, key.keys.get(number), warnings, key.conflicts.has(number))); });
      if (!items.length) questions.push(latexBlock(body, String(index + 1), config, key.keys.get(String(index + 1)), warnings, key.conflicts.has(String(index + 1))));
    } else questions.push(latexBlock(body, String(index + 1), config, key.keys.get(String(index + 1)), warnings, key.conflicts.has(String(index + 1))));
  });
  else { const list = environment(source, 'enumerate'); if (list) topItems(list.inner).forEach((item, index) => { const number = item.label.replace(/[^\da-z]/gi, '') || String(index + 1); questions.push(latexBlock(item.body, number, config, key.keys.get(normalizeNumber(number)), warnings, key.conflicts.has(normalizeNumber(number)))); }); }
  if (questions.length > 1000) throw new Error('A paper may contain at most 1,000 questions. Split this source.');
  if (!questions.length) { const fallback = parseCbtText(fallbackSource, config); return { questions: fallback.questions, warnings: [...warnings, ...fallback.warnings] }; }
  return { questions, warnings: [...warnings, ...key.warnings] };
}

export function getCbtQuestionIssues(question: TestQuestion): string[] {
  const issues: string[] = [];
  if (!question.prompt.trim()) issues.push('Add the question text.');
  if (!question.subject.trim()) issues.push('Choose a subject.');
  if (question.kind === 'numeric') { if (question.numericAnswer === undefined || !Number.isFinite(question.numericAnswer)) issues.push('Enter the correct numerical answer.'); if (!Number.isFinite(question.tolerance ?? 0) || (question.tolerance ?? 0) < 0) issues.push('Tolerance must be zero or greater.'); }
  else { if (question.options.length < 2 || question.options.length > 20 || question.options.some(option => !option.trim())) issues.push('Add 2–20 complete answer options.'); if (new Set(question.options.map(option => option.trim().toLowerCase())).size !== question.options.length) issues.push('Answer options must be distinct.'); if (!question.correctAnswers.length || question.kind === 'single' && question.correctAnswers.length !== 1 || question.correctAnswers.some(index => !Number.isInteger(index) || index < 0 || index >= question.options.length)) issues.push('Select the correct answer key.'); }
  if (!Number.isFinite(question.marks) || question.marks <= 0) issues.push('Correct marks must be positive.');
  if (!Number.isFinite(question.negativeMarks) || question.negativeMarks < 0) issues.push('Wrong-answer penalty must be zero or greater.');
  if (!Number.isFinite(question.idealSeconds) || question.idealSeconds < 1) issues.push('Set a positive target time.');
  return issues;
}
