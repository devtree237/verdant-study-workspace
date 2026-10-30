import type { CbtDraftQuestion } from './cbt-import';
import { parseCbtSolutions } from './cbt-solutions';
import { protectCbtMathML } from './cbt-mathml';

export type CbtAnswer = { kind: 'choice'; labels: string[] } | { kind: 'numeric'; value: number; tolerance: number };
export type CbtAnswerKeyEntry = { sourceNumber: string; answer?: CbtAnswer; conflict?: boolean; issue?: string; explanation?: string; solutionConflict?: boolean };
export type CbtAnswerKeyParse = { entries: CbtAnswerKeyEntry[]; warnings: string[] };
export type CbtAnswerKeyMergeRow = { sourceNumber: string; answerLabel: string; status: 'applied' | 'kept' | 'conflict' | 'unmatched' | 'ambiguous' | 'invalid'; message: string };
export type CbtAnswerKeyMergeResult = { questions: CbtDraftQuestion[]; rows: CbtAnswerKeyMergeRow[]; applied: number; solutionsApplied?: number; warnings: string[] };
const MAX_SOURCE = 4_000_000, MAX_ENTRIES = 1000;
const NUMBER = '(?:[A-Za-z][-.])?\\d+(?:\\([A-Za-z]\\)|[A-Za-z]|[.]\\d+)?';
const Q_HEADER = /^(?:q(?:uestion)?s?\.?\s*(?:(?:no|number)s?\.?)?|nos?\.?|numbers?)$/i;
const A_HEADER = /^(?:keys?|ans(?:wer)?s?\.?|correct\s+answers?)$/i;

/** Q01, (01), and 1(a) normalize to 1, 1, and 1a. Numeric subparts and
 * section separators remain significant: 1.1 never becomes question 11. */
export function normalizeCbtSourceNumber(value: string): string {
  let number = value.normalize('NFKC').trim().replace(/^(?:question|q)\.?\s*(?=\d)/i, '').replace(/^\((.+)\)$/, '$1').replace(/\s+/g, '').toLowerCase();
  number = number.replace(/\(([a-z])\)/g, '$1').replace(/[):.]+$/, '').replace(/\.([a-z])$/, '$1');
  if (!new RegExp('^' + NUMBER + '$', 'i').test(number)) return '';
  return number.replace(/\d+/g, digits => digits.replace(/^0+(?=\d)/, ''));
}

function group(source: string, start: number): { value: string; end: number } | null {
  if (source[start] !== '{') return null;
  let depth = 1;
  for (let index = start + 1; index < source.length; index++) {
    if (source[index] === '\\') { index++; continue; }
    if (source[index] === '{') depth++;
    else if (source[index] === '}' && !--depth) return { value: source.slice(start + 1, index), end: index + 1 };
  }
  return null;
}
function stripComments(source: string): string {
  return source.split('\n').map(line => { for (let index = 0; index < line.length; index++) if (line[index] === '%') { let slashes = 0; for (let at = index - 1; at >= 0 && line[at] === '\\'; at--) slashes++; if (slashes % 2 === 0) return line.slice(0, index); } return line; }).join('\n');
}
function cellText(raw: string): string {
  let text = raw.trim();
  for (let pass = 0; pass < 12; pass++) {
    const match = /\\(?:textbf|textit|textnormal|textrm|textsf|texttt|emph|underline|mathrm|mathbf|mathsf|mathit|operatorname)\s*\{/.exec(text);
    if (!match) break;
    const value = group(text, match.index + match[0].length - 1); if (!value) break;
    text = text.slice(0, match.index) + value.value + text.slice(value.end);
  }
  return text.replace(/\\pm\b/g, '±').replace(/\\[({]/g, match => match === '\\{' ? '{' : '').replace(/\\[)}]/g, match => match === '\\}' ? '}' : '').replace(/\$+/g, '').replace(/\\(?:quad|qquad|enspace|thinspace)\b|\\[,;!]/g, ' ').replace(/~/g, ' ').replace(/\\(?:small|footnotesize|scriptsize)\b/g, '').trim();
}

function parseAnswer(raw: string): CbtAnswer | null {
  let value = cellText(raw);
  const headline = /^(?:correct\s*)?(?:answers?|ans\.?|keys?)(?=\s|[:=]|$)\s*[:=]?\s*/i;
  // A difficulty suffix is metadata only on an explicitly labeled answer
  // headline. A bare "A | C" remains invalid rather than losing a key token.
  if (headline.test(value)) value = value.replace(headline, '').replace(/\s*\|\s*(?:[EMHL]|Easy|Medium|Moderate|Hard|Tough)\s*$/i, '').trim();
  // Balanced, whole-token wrappers only; unknown suffixes are never truncated.
  for (let pass = 0; pass < 3; pass++) if (/^\{[^{}]*\}$/.test(value) || /^\[[^[\]]*\]$/.test(value)) value = value.slice(1, -1).trim();
  const numeric = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:\s*(?:±|\+\s*\/\s*-)\s*([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?))?$/i.exec(value);
  if (numeric) {
    const number = Number(numeric[1]), tolerance = Number(numeric[2] || 0);
    return Number.isFinite(number) && Math.abs(number) <= 1e15 && Number.isFinite(tolerance) && tolerance >= 0 && tolerance <= 1e9 ? { kind: 'numeric', value: number, tolerance } : null;
  }
  const numericOptions = /^(?:options?|choices?)\s+(.+)$/i.exec(value);
  if (numericOptions && /\d/.test(numericOptions[1])) {
    const rest = numericOptions[1].replace(/\((\d+)\)/g, '$1').trim();
    if (!/^\d+(?:\s*(?:[,/&+]|\band\b)\s*\d+|\s+\d+)*$/i.test(rest)) return null;
    const labels = [...new Set(rest.split(/\s*(?:[,/&+]|\band\b)\s*|\s+/i).filter(Boolean).map(label => String(Number(label))))];
    return labels.length && labels.every(label => Number(label) >= 1 && Number(label) <= 20) ? { kind: 'choice', labels: labels.sort((a, b) => Number(a) - Number(b)) } : null;
  }
  if (numericOptions) value = numericOptions[1].trim();
  // Compact multiple labels must be uppercase: ordinary words such as "bad"
  // or "or" must not be guessed as B/A/D or O/R answers.
  let tokens: string[];
  if (/^[A-T]{1,20}$/.test(value)) tokens = [...value];
  else {
    value = value.replace(/\(([A-T])\)/gi, '$1 ').trim();
    if (!/^[A-T](?:(?:\s+and\s+|\s*[,/&+]\s*|\s+)[A-T])*$/i.test(value)) return null;
    tokens = value.toUpperCase().split(/\s+and\s+|\s*[,/&+]\s*|\s+/i);
  }
  const labels = [...new Set(tokens)].sort();
  return labels.length ? { kind: 'choice', labels } : null;
}
function answerIdentity(answer: CbtAnswer): string { return answer.kind === 'numeric' ? `n:${answer.value}:${answer.tolerance}` : `c:${[...new Set(answer.labels)].sort().join(',')}`; }
function answerLabel(answer?: CbtAnswer): string { return !answer ? 'Unrecognized' : answer.kind === 'choice' ? answer.labels.join(', ') : `${answer.value}${answer.tolerance ? ` ± ${answer.tolerance}` : ''}`; }
function likelyKey(raw: string): boolean {
  if (!raw.trim() || raw.length > 160 || /\\|^[-_.\s]+$/.test(raw) || /\b(?:because|therefore|since|explanation|solution|reason|incorrect|correctly|question|score|confidence)\b/i.test(raw)) return false;
  // An unknown token in a key row must remain invalid, but ordinary numbered
  // explanation sentences and blank revision prompts are not answer-key rows.
  const words = raw.match(/[a-z]+/gi) || [];
  return words.length <= 1 || words.every(word => word.length === 1 || /^(?:and|or|maybe|see|note|options?|choices?|correct|answers?|ans|keys?)$/i.test(word));
}

/** Splits only top-level TeX row/cell separators, never separators inside braces. */
function texSplit(source: string, rows: boolean): string[] {
  const result: string[] = []; let depth = 0, start = 0;
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\\') {
      if (rows && source[index + 1] === '\\' && depth === 0) {
        result.push(source.slice(start, index)); index++;
        const spacing = /^\s*\[[^\]]*\]/.exec(source.slice(index + 1)); if (spacing) index += spacing[0].length;
        start = index + 1;
      } else index++;
      continue;
    }
    if (source[index] === '{') depth++;
    else if (source[index] === '}') depth = Math.max(0, depth - 1);
    else if (!rows && source[index] === '&' && depth === 0) { result.push(source.slice(start, index)); start = index + 1; }
  }
  result.push(source.slice(start)); return result;
}

/** Deterministic source-only parser. Recognizes Q/Key column groups, paired Q and
 * Answer rows, explicit numbered pairs, numbered enumerate answers, and the
 * two-argument shorthand \answer{question number}{key}. TeX is never executed. */
export function parseCbtAnswerKey(input: string, format: 'text' | 'latex' = 'text'): CbtAnswerKeyParse {
  if (input.length > MAX_SOURCE) throw new Error('The answer-key source is too large. Keep it below 4 million characters.');
  let source = protectCbtMathML(input.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/\u00a0/g, ' '), { latexComments: format === 'latex' }).source;
  if (format === 'latex') source = stripComments(source);
  const entries = new Map<string, CbtAnswerKeyEntry>(), warnings = new Set<string>(); let candidates = 0;
  if (format === 'latex' && /\textbf\{(?:Answer|Ans\.?|Key)\b/i.test(input)) warnings.add('A malformed TAB + extbf answer heading was recovered as a literal supplied answer. Verify these solution headings against the source.');
  const add = (number: string, raw: string, strict = true) => {
    const normalized = normalizeCbtSourceNumber(cellText(number)); if (!normalized) return;
    const cleaned = cellText(raw), answer = parseAnswer(cleaned);
    if (!answer && !strict && !likelyKey(cleaned)) return;
    if (++candidates > 10000) throw new Error('The answer key contains too many repeated entries. Split this source.');
    const incoming: CbtAnswerKeyEntry = answer ? { sourceNumber: cellText(number).trim(), answer } : { sourceNumber: cellText(number).trim(), issue: 'The complete answer token was not recognized. Review it manually.' };
    const previous = entries.get(normalized);
    if (previous?.conflict) return;
    if (previous) {
      if (previous.answer && incoming.answer && answerIdentity(previous.answer) === answerIdentity(incoming.answer)) return;
      entries.set(normalized, { sourceNumber: previous.sourceNumber, conflict: true, issue: 'Conflicting or invalid duplicate keys were found for this source question.' });
      warnings.add(`Question ${previous.sourceNumber} has conflicting duplicate answer keys. No key will be applied until the source is corrected.`);
    } else {
      if (entries.size >= MAX_ENTRIES) throw new Error('An answer key may contain at most 1,000 question entries. Split this source.');
      entries.set(normalized, incoming);
      if (!answer) warnings.add(`Question ${incoming.sourceNumber} has an unrecognized answer token.`);
    }
  };
  const processRows = (rows: string[][]) => {
    let pairs: { number: number; answer: number }[] = [], columns = 0;
    for (const raw of rows) {
      const cells = raw.map(cellText); if (!cells.some(Boolean)) continue;
      const headers: { number: number; answer: number }[] = [];
      cells.forEach((cell, index) => { if (!Q_HEADER.test(cell)) return; for (let next = index + 1; next < cells.length && !Q_HEADER.test(cells[next]); next++) if (A_HEADER.test(cells[next])) { headers.push({ number: index, answer: next }); break; } });
      if (headers.length) { pairs = headers; columns = cells.length; continue; }
      if (pairs.length) {
        if (cells.length !== columns) { if (cells.some(cell => normalizeCbtSourceNumber(cell))) warnings.add('A key-table row has inconsistent columns and was left unapplied. Review the extracted source.'); continue; }
        for (const pair of pairs) if (normalizeCbtSourceNumber(cells[pair.number])) add(cells[pair.number], cells[pair.answer]);
      } else if (cells.length >= 2 && cells.length % 2 === 0 && cells.every((cell, index) => index % 2 ? !!parseAnswer(cell) : !!normalizeCbtSourceNumber(cell))) for (let index = 0; index < cells.length; index += 2) add(cells[index], cells[index + 1]);
    }
  };

  if (format === 'latex') {
    // Tables are consumed separately so their explanation/difficulty columns do
    // not become answers in the subsequent plain-pair pass.
    const tables = /\\begin\{(tabular\*?|tabularx|longtable)\}(?:\[[^\]]*\])?/g;
    const ranges: { start: number; end: number }[] = [];
    for (const start of source.matchAll(tables)) {
      let at = start.index! + start[0].length; while (/\s/.test(source[at] || '')) at++;
      if (start[1] === 'tabular*' || start[1] === 'tabularx') { const width = group(source, at); if (!width) continue; at = width.end; while (/\s/.test(source[at] || '')) at++; }
      const alignment = group(source, at); if (!alignment) continue; at = alignment.end;
      const endToken = `\\end{${start[1]}}`, end = source.indexOf(endToken, at); if (end < 0) continue;
      const inner = source.slice(at, end).replace(/\\(?:cmidrule|cline)(?:\([^)]*\))?\s*\{[^}]*\}/g, '').replace(/\\(?:toprule|midrule|bottomrule|hline|endhead|endfirsthead|endfoot|endlastfoot)\b(?:\[[^\]]*\])?/g, '');
      processRows(texSplit(inner, true).map(row => texSplit(row, false)));
      ranges.push({ start: start.index!, end: end + endToken.length });
    }
    const shorthand = /\\(?:answer|correctanswer)\s*\{/gi;
    for (const command of source.matchAll(shorthand)) {
      const number = group(source, command.index! + command[0].length - 1); if (!number) continue;
      let at = number.end; while (/\s/.test(source[at] || '')) at++;
      const answer = group(source, at); if (answer) add(number.value, answer.value);
    }
    const blocks = /\\begin\{questionblock\}\s*\{([^}]*)\}([\s\S]*?)\\end\{questionblock\}/g;
    for (const block of source.matchAll(blocks)) {
      const headline = /^\s*\\textbf\{([^}]*)\}/.exec(block[2]);
      const answer = headline && /^(?:Answer|Key)\s*[:=]?\s*(.*?)(?:\s*\|\s*(?:[EMHL]|Easy|Medium|Moderate|Hard|Tough))?$/i.exec(cellText(headline[1]));
      if (answer) add(block[1], answer[1]);
    }
    const enumerates = /\\begin\{enumerate\}(?:\[([^\]]*)\])?/g;
    for (const begin of source.matchAll(enumerates)) {
      const tokens = /\\(?:begin\{([^}]+)\}|end\{([^}]+)\}|item\b(?:\[([^\]]*)\])?)/g;
      const tail = source.slice(begin.index! + begin[0].length); let depth = 0, end = -1;
      const items: { number: string; start: number; end: number }[] = [];
      let next = Number(/\bstart\s*=\s*(\d+)/.exec(begin[1] || '')?.[1] || 1);
      for (const token of tail.matchAll(tokens)) {
        if (token[1]) depth++;
        else if (token[2]) { if (!depth && token[2] === 'enumerate') { end = token.index!; break; } depth = Math.max(0, depth - 1); }
        else if (!depth) { if (items.length) items[items.length - 1].end = token.index!; items.push({ number: token[3] || String(next), start: token.index! + token[0].length, end: -1 }); next++; }
      }
      if (end < 0 || !items.length) continue;
      items[items.length - 1].end = end;
      const values = items.map(item => cellText(tail.slice(item.start, item.end)));
      if (values.every(likelyKey) && values.some(value => !!parseAnswer(value))) items.forEach((item, index) => add(item.number, values[index]));
    }
    for (const range of ranges.sort((a, b) => b.start - a.start)) source = source.slice(0, range.start) + '\n' + source.slice(range.end);
    // Do not scan explanatory question blocks or enumerations a second time.
    source = source.replace(/\\begin\{questionblock\}[\s\S]*?\\end\{questionblock\}/g, '').replace(/\\begin\{enumerate\}[\s\S]*?\\end\{enumerate\}/g, '');
  }

  const lines = source.split('\n');
  let horizontal: string[] | null = null, tableHeaders: string[] | null = null;
  const marker = new RegExp('(?:^|(?<=[\\s;|]))(?:Q(?:uestion)?\\.?\\s*)?(' + NUMBER + ')\\s*(?::|=|[.)](?=\\s|[A-T({])|-(?=\\s|[A-T({]))\\s*', 'gi');
  for (const rawLine of lines) {
    const line = cellText(rawLine).trim(); if (!line) continue;
    const hQuestion = /^(?:questions?|q(?:\.?\s*nos?\.?)?)\s*[:=]?\s+(.+)$/i.exec(line);
    if (hQuestion) { const numbers = hQuestion[1].split(/[\s,|;]+/).filter(Boolean); if (numbers.length && numbers.every(number => !!normalizeCbtSourceNumber(number))) { horizontal = numbers; tableHeaders = null; continue; } }
    const hAnswer = /^(?:answers?|ans\.?|keys?)\s*[:=]?\s+(.+)$/i.exec(line);
    if (horizontal && hAnswer) {
      let values = hAnswer[1].split(/\t+|\s*\|\s*| {2,}/).filter(Boolean);
      if (values.length === 1 && horizontal.length > 1) values = hAnswer[1].trim().split(/\s+/);
      if (values.length !== horizontal.length && horizontal.length > 1) values = hAnswer[1].split(/\s*,\s*/);
      if (values.length === horizontal.length) horizontal.forEach((number, index) => add(number, values[index]));
      else warnings.add('A paired question/answer row has different column counts and was left unapplied.');
      horizontal = null; continue;
    }
    horizontal = null;
    const cells = line.includes('|') ? line.split('|').map(cell => cell.trim()).filter((cell, index, all) => !!cell || index > 0 && index < all.length - 1) : line.includes('\t') ? line.split(/\t+/) : / {2,}/.test(line) ? line.split(/ {2,}/) : line.split(/\s+/);
    if (cells.some(cell => Q_HEADER.test(cell)) && cells.some(cell => A_HEADER.test(cell))) { tableHeaders = cells; continue; }
    if (tableHeaders && cells.length === tableHeaders.length && normalizeCbtSourceNumber(cells[0])) { processRows([tableHeaders, cells]); continue; }
    if (tableHeaders && cells.some(cell => normalizeCbtSourceNumber(cell)) && cells.length !== tableHeaders.length && normalizeCbtSourceNumber(cells[0])) { warnings.add('A key-table row has inconsistent columns and was left unapplied.'); continue; }
    tableHeaders = null;
    const markers = [...line.matchAll(marker)];
    if (markers.length) {
      const prefix = line.slice(0, markers[0].index).trim(); if (prefix && !/^(?:answers?|answer\s*key)\s*:?$/i.test(prefix)) continue;
      markers.forEach((match, index) => { const value = line.slice(match.index! + match[0].length, markers[index + 1]?.index ?? line.length).replace(/^[\s;|]+|[\s;|]+$/g, ''); add(match[1], value, false); });
    } else if (cells.length >= 4 && cells.length % 2 === 0 && cells.every((cell, index) => index % 2 ? !!parseAnswer(cell) && !/^\d+$/.test(cell) : !!normalizeCbtSourceNumber(cell))) processRows([cells]);
    else {
      const pair = new RegExp('^(' + NUMBER + ')\\s+(.+)$', 'i').exec(line);
      if (pair) {
        const answer = parseAnswer(pair[2]);
        // Bare numeric columns can also be chemical subscripts or calculation
        // fragments in a solution PDF. Numerical keys require explicit pair
        // punctuation, a labeled Answer value, or a recognized key-table row.
        if (answer && (answer.kind === 'choice' || /^(?:correct\s*)?(?:answers?|ans\.?|keys?)(?=\s|[:=]|$)/i.test(pair[2]))) add(pair[1], pair[2], false);
      }
    }
  }
  for (const solution of parseCbtSolutions(input, format)) {
    const number = normalizeCbtSourceNumber(solution.sourceNumber); if (!number) continue;
    if (solution.key) add(solution.sourceNumber, solution.key);
    const previous = entries.get(number);
    if (!solution.explanation) continue;
    if (previous?.explanation && previous.explanation !== solution.explanation) {
      entries.set(number, { ...previous, explanation: undefined, solutionConflict: true });
      warnings.add(`Question ${solution.sourceNumber} has differing supplied solutions. No explanation was applied.`);
    } else if (!previous?.solutionConflict) entries.set(number, { ...(previous || { sourceNumber: solution.sourceNumber }), explanation: solution.explanation });
  }
  if (!entries.size) warnings.add('No unambiguous numbered answer-key entries or labelled solutions were recognized. Review the source layout and answer labels.');
  return { entries: [...entries.values()], warnings: [...warnings] };
}

function existingAnswer(question: CbtDraftQuestion): boolean { return question.kind === 'numeric' ? question.numericAnswer !== undefined : question.correctAnswers.length > 0; }
function sameAnswer(left: CbtDraftQuestion, right: CbtDraftQuestion): boolean {
  if (left.kind === 'numeric' || right.kind === 'numeric') return left.kind === right.kind && left.numericAnswer === right.numericAnswer && (left.tolerance ?? 0) === (right.tolerance ?? 0);
  const a = [...new Set(left.correctAnswers)].sort((x, y) => x - y), b = [...new Set(right.correctAnswers)].sort((x, y) => x - y);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Fallback labels are A–T. Explicit "options 1 and 3" may use one-based
 * positions only when sourceOptionLabels is absent; bare numbers stay numeric. */
export function mergeCbtAnswerKey(questions: CbtDraftQuestion[], key: CbtAnswerKeyParse, mode: 'fill' | 'replace' = 'fill'): CbtAnswerKeyMergeResult {
  if (questions.length > MAX_ENTRIES || key.entries.length > MAX_ENTRIES) throw new Error('A paper or answer key may contain at most 1,000 entries.');
  const result = [...questions], rows: CbtAnswerKeyMergeRow[] = [], warnings = [...key.warnings], byNumber = new Map<string, number[]>();
  questions.forEach((question, index) => { const number = normalizeCbtSourceNumber(question.sourceNumber); if (number) byNumber.set(number, [...(byNumber.get(number) || []), index]); });
  let applied = 0, solutionsApplied = 0;
  for (const entry of key.entries) {
    const number = normalizeCbtSourceNumber(entry.sourceNumber), indices = byNumber.get(number) || [];
    const row = (status: CbtAnswerKeyMergeRow['status'], message: string) => rows.push({ sourceNumber: entry.sourceNumber, answerLabel: entry.conflict ? 'Conflicting keys' : answerLabel(entry.answer), status, message });
    if (entry.conflict) { row('conflict', entry.issue || 'The uploaded source has conflicting keys. Correct it before applying.'); continue; }
    if (!number || entry.issue || !entry.answer && !entry.explanation) { row('invalid', entry.issue || 'The source number or complete answer token was not recognized.'); continue; }
    if (!indices.length) { row('unmatched', 'No draft question has this normalized source number. No positional match was guessed.'); continue; }
    if (indices.length !== 1) { row('ambiguous', 'More than one draft question has this source number. Give the questions distinct source numbers first.'); continue; }
    const index = indices[0]; let question = result[index]; const answer = entry.answer;
    if (entry.explanation) {
      if (!question.explanation || mode === 'replace') { if (question.explanation !== entry.explanation) solutionsApplied++; question = { ...question, explanation: entry.explanation }; result[index] = question; }
      else if (question.explanation !== entry.explanation) warnings.push(`Question ${entry.sourceNumber}: the existing explanation was retained. Use Replace matching to change it.`);
    }
    if (!answer) { row('kept', 'A labelled solution was attached by its source number; no answer key was inferred.'); continue; }
    let proposed: CbtDraftQuestion;
    if (answer.kind === 'numeric') {
      if (!Number.isFinite(answer.value) || Math.abs(answer.value) > 1e15 || !Number.isFinite(answer.tolerance) || answer.tolerance < 0 || answer.tolerance > 1e9) { row('invalid', 'The numerical key or tolerance is outside the supported range.'); continue; }
      if (question.kind !== 'numeric' && question.options.length) { row('invalid', 'A bare numerical key cannot identify a choice option. Use an explicit option label or change the question type.'); continue; }
      proposed = { ...question, kind: 'numeric', options: [], correctAnswers: [], numericAnswer: answer.value, tolerance: answer.tolerance };
    } else {
      if (!answer.labels.length || question.kind === 'numeric' || !question.options.length) { row('invalid', 'This choice key needs a question with answer options.'); continue; }
      const sourceLabels = question.sourceOptionLabels;
      if (sourceLabels && (sourceLabels.length !== question.options.length || sourceLabels.some(label => !/^(?:[A-T]|[1-9]|1\d|20)$/i.test(label.replace(/[()\s]/g, ''))) || new Set(sourceLabels.map(label => label.toUpperCase().replace(/[()\s]/g, ''))).size !== sourceLabels.length)) { row('ambiguous', 'The question’s source option labels are duplicated or incomplete. Review the option labels first.'); continue; }
      const labels = sourceLabels?.map(label => label.toUpperCase().replace(/[()\s]/g, ''));
      const selected = answer.labels.map(label => labels ? labels.indexOf(label.toUpperCase()) : /^\d+$/.test(label) ? Number(label) - 1 : /^[A-T]$/i.test(label) ? label.toUpperCase().charCodeAt(0) - 65 : -1);
      if (selected.some(value => !Number.isInteger(value) || value < 0 || value >= question.options.length)) { row('invalid', 'At least one uploaded option label is absent from this question. No partial key was applied.'); continue; }
      const correctAnswers = [...new Set(selected)].sort((a, b) => a - b);
      proposed = { ...question, kind: correctAnswers.length > 1 || question.kind === 'multiple' ? 'multiple' : 'single', correctAnswers, numericAnswer: undefined, tolerance: undefined };
    }
    if (existingAnswer(question) && sameAnswer(question, proposed)) { row('kept', 'The existing answer already matches the uploaded key.'); continue; }
    if (mode === 'fill' && existingAnswer(question)) { row('conflict', 'The existing answer differs. It was retained; explicitly choose Replace matching to change it.'); continue; }
    result[index] = proposed; applied++; row('applied', mode === 'replace' ? 'The matching question now uses this verified source key.' : 'The missing key was filled by its source number.');
  }
  for (const status of ['unmatched', 'ambiguous', 'conflict', 'invalid'] as const) { const count = rows.filter(row => row.status === status).length; if (count) warnings.push(`${count} answer-key ${count === 1 ? 'entry is' : 'entries are'} ${status} and were left unchanged.`); }
  return { questions: result, rows, applied, solutionsApplied, warnings: [...new Set(warnings)] };
}
