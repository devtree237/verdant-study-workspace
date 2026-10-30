import type { Difficulty, TestQuestion } from './testing-model';
import { parseLatexStructure } from './latex-ast';
import type { LatexAstQuestion, LatexSourceMetadata } from './latex-ast';
import { protectCbtMathML } from './cbt-mathml';

export type CbtImportDefaults = { subject: string; marks: number; negativeMarks: number; idealSeconds: number; difficulty: Difficulty };
export type CbtDraftQuestion = TestQuestion & { sourceNumber: string; sourcePage?: number; sourceOptionLabels?: string[]; sourceMetadata?: LatexSourceMetadata };
export type CbtParseResult = { questions: CbtDraftQuestion[]; warnings: string[]; embeddedSource?: string };
const defaults: CbtImportDefaults = { subject: '', marks: 4, negativeMarks: 1, idealSeconds: 120, difficulty: 'Moderate' };
const MAX_SOURCE = 4_000_000;
const normalizeNumber = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function safeSource(source: string): string {
  if (source.length > MAX_SOURCE) throw new Error('This source is too large. Split it into smaller papers.');
  return source.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/\u00a0/g, ' ');
}
/** Reads only explicit option labels, never explanatory text or answer expressions. */
export function parseCbtAnswerTokens(raw: string): string[] | null {
  const value = raw.trim();
  let tokens: string[];
  if (/^[A-T]{1,20}$/.test(value)) tokens = [...value];
  else {
    const expanded = value.replace(/\(([A-T])\)/gi, '$1 ').trim();
    if (!/^[A-T](?:(?:\s+and\s+|\s*[,/&+]\s*|\s+)[A-T])*$/i.test(expanded)) return null;
    tokens = expanded.toUpperCase().split(/\s+and\s+|\s*[,/&+]\s*|\s+/i);
  }
  return [...new Set(tokens)].sort();
}
function answerKey(source: string): { body: string; keys: Map<string, string>; conflicts: Set<string>; warnings: string[] } {
  const heading = /^[ \t]*(?:answer[ \t]*key|answer[ \t]*sheet|answers(?=[ \t]*[:：]?[ \t]*(?:\d|$)))[ \t]*[:：]?[ \t]*(.*)$/im.exec(source);
  if (!heading) return { body: source, keys: new Map(), conflicts: new Set(), warnings: [] };
  const tail = heading[1] + '\n' + source.slice(heading.index + heading[0].length), keys = new Map<string, string>(), conflicts = new Set<string>(), warnings: string[] = [];
  // Split at numbered entries first, then validate each complete value. A partial
  // match such as the A in "A or perhaps C" must never become a supplied key.
  const entries = [...tail.matchAll(/(?:^|[\s;,])(?:Q(?:uestion)?\s*)?(\d+(?:\s*\(?[a-z]\)?)?)\s*(?:[).][ \t]+|[:=\-][ \t]*)/gi)];
  for (let index = 0; index < entries.length; index++) {
    const match = entries[index], id = normalizeNumber(match[1]);
    const value = tail.slice(match.index! + match[0].length, entries[index + 1]?.index ?? tail.length).trim().replace(/[;,]+$/, '').trim();
    if (!parseCbtAnswerTokens(value) && !numericKey(value)) { warnings.push('The answer key for question ' + match[1] + ' is not recognized. Select the answer manually during review.'); keys.delete(id); conflicts.add(id); continue; }
    if (conflicts.has(id)) continue;
    if (keys.has(id) && canonicalKey(keys.get(id)!) !== canonicalKey(value)) {
      warnings.push('Conflicting answer keys for question ' + match[1] + '. Select the correct answer manually during review.');
      keys.delete(id); conflicts.add(id);
    } else keys.set(id, value);
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
  return parseCbtAnswerTokens(raw)?.join(',') ?? 'unrecognized:' + raw.trim();
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
  const letters = parseCbtAnswerTokens(value);
  if (!letters || new Set(labels).size !== labels.length) return;
  const selected = letters.map(letter => labels.indexOf(letter));
  if (selected.some(index => index < 0)) return;
  question.correctAnswers = [...new Set(selected)].sort((a, b) => a - b);
  if (question.correctAnswers.length > 1) question.kind = 'multiple';
}
function maskMath(source: string): string {
  return source.replace(/\$\$[\s\S]*?\$\$|\$(?:\\.|[^$])*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, value => value.replace(/[^\n]/g, ' '));
}
type OptionMarker = { index: number; end: number; label: string; style: string };
function optionMarkers(content: string): { markers: OptionMarker[]; ambiguous: boolean } {
  const masked = maskMath(content), markers: OptionMarker[] = [];
  let offset = 0;
  for (const line of masked.split('\n')) {
    const candidates = [...line.matchAll(/(?:^|[ \t]+)(?:\(([A-Ta-t])\)|([A-T])([).:]))[ \t]+/g)];
    const first = candidates[0];
    // A new option row must begin with its label, or have a visibly separate
    // inline options region. Single-spaced prose references remain in the stem.
    if (first && (!line.slice(0, first.index).trim() || /^\s{2,}/.test(first[0]))) {
      const style = first[1] ? '()' : first[3];
      for (const marker of candidates) if ((marker[1] ? '()' : marker[3]) === style) markers.push({ index: offset + marker.index!, end: offset + marker.index! + marker[0].length, label: (marker[1] || marker[2]).toUpperCase(), style });
    }
    offset += line.length + 1;
  }
  // Labels inside sample tables or the text of an option can use A:/B: too.
  // Choose a complete, consistent sequence rather than merging distinct styles
  // or two lists which both restart at A. The discarded text stays in the stem.
  const groups: OptionMarker[][] = [];
  for (const style of new Set(markers.map(marker => marker.style))) {
    let group: OptionMarker[] = [];
    for (const marker of markers.filter(item => item.style === style)) {
      if (group.some(item => item.label === marker.label)) { groups.push(group); group = []; }
      group.push(marker);
    }
    if (group.length) groups.push(group);
  }
  const complete = groups.filter(group => group.length >= 2 && group.every(marker => marker.label.charCodeAt(0) - 65 < group.length));
  if (!complete.length) return { markers, ambiguous: groups.length > 1 };
  const candidates = complete.sort((a, b) => b.length - a.length || a[0].index - b[0].index);
  const selected = candidates[0] || [];
  return { markers: selected, ambiguous: candidates.length > 1 && candidates[1].length === selected.length };
}
function fresh(number: string, config: CbtImportDefaults, page?: number): CbtDraftQuestion {
  return { id: crypto.randomUUID(), sourceNumber: number, ...(page ? { sourcePage: page } : {}), prompt: '', subject: config.subject, chapter: '', topic: '', difficulty: config.difficulty, kind: 'single', options: [], correctAnswers: [], marks: config.marks, negativeMarks: config.negativeMarks, idealSeconds: config.idealSeconds, explanation: '' };
}
function parseBlock(source: string, number: string, config: CbtImportDefaults, key?: string, page?: number, context: { warnings?: string[]; conflict?: boolean; options?: string[]; labels?: string[]; key?: string; multiple?: boolean } = {}): CbtDraftQuestion {
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
      else if (name === 'type' && /^(?:multiple(?:\s+correct)?|multi[ -]?select|multiple[ -]?choice)$/i.test(value)) question.kind = 'multiple';
      else if (['marks', 'negativemarks', 'idealseconds'].includes(name)) question[name === 'marks' ? 'marks' : name === 'negativemarks' ? 'negativeMarks' : 'idealSeconds'] = Number(value);
      continue;
    }
    if (!/^\s*\[Page\s+\d+\]\s*$/i.test(line)) lines.push(line);
  }
  const content = lines.join('\n').trim();
  const optionList = optionMarkers(content), options = optionList.markers;
  const usable = options.length >= 2 || (options.length === 1 && options[0].label === 'A');
  const labels: string[] = [];
  let extracted: { label: string; text: string }[] = [];
  if (context.options) {
    question.prompt = content;
    if (context.multiple) question.kind = 'multiple';
    extracted = context.options.map((text, index) => ({ text, label: context.labels?.[index] ?? String.fromCharCode(65 + index) }));
  } else if (usable) {
    question.prompt = content.slice(0, options[0].index).trim();
    extracted = options.map((match, index) => ({ label: match.label, text: content.slice(match.end, options[index + 1]?.index ?? content.length).trim() }));
  } else question.prompt = content;
  if (extracted.length) {
    const canonical = new Set(extracted.map(option => option.label)).size === extracted.length && extracted.every(option => /^[A-T]$/.test(option.label) && option.label.charCodeAt(0) - 65 < extracted.length);
    if (canonical) extracted.sort((a, b) => a.label.localeCompare(b.label));
    else context.warnings?.push('Question ' + number + ' has repeated or incomplete option labels. Check the column layout and labels manually.');
    extracted.forEach(option => { labels.push(option.label); question.options.push(option.text); });
  }
  if (labels.length) question.sourceOptionLabels = labels;
  if (!context.options && optionList.ambiguous) context.warnings?.push('Question ' + number + ' has more than one possible option list. Check sample-table labels and answer options manually; its key was left unresolved.');
  const explicitKey = context.conflict || !context.options && optionList.ambiguous ? undefined : resolveKey(candidateKeys, number, context.warnings || []);
  if (!question.options.length && explicitKey && numericKey(explicitKey)) question.kind = 'numeric';
  applyKey(question, explicitKey, labels);
  question.explanation = question.explanation.trim();
  return question;
}

function hasQuestionEvidence(source: string): boolean {
  return optionMarkers(source).markers.length > 0 || /^[ \t]*type[ \t]*[:：][ \t]*(?:numeric|numerical|integer)\b/im.test(source) || /^[ \t]*(?:correct[ \t]*answers?|answers?|key)[ \t]*[:：=]/im.test(source);
}
/** Conservative preamble classifier. Callers only omit a leading run when a
 * later question has explicit question evidence; incomplete stems stay reviewable. */
export function isCbtInstructionBlock(source: string, underInstructions = false): boolean {
  if (hasQuestionEvidence(source)) return false;
  const text = source.replace(/^[ \t]*\[Page\s+\d+\][ \t]*$/gim, '').replace(/\*\*/g, '').trim();
  if (!text || /\?/.test(text) || /^(?:which|what|why|how|calculate|determine|find|identify|compare|predict|explain)\b/i.test(text)) return false;
  const heading = /^(?:simulated[ -]+timed[ -]+attempt|competency[ -]+tag(?:ging)?|post[ -]+test[ -]+diagnosis|(?:general[ -]+|test[ -]+|exam[ -]+)?instructions?|directions?|(?:test[ -]+)?guidelines?|marking[ -]+scheme|scoring[ -]+rules?|answer[ -]+recording|confidence[ -]+(?:level|recording|tracking))[ \t]*(?:[:：–—-]|\n|$)/i;
  if (heading.test(text)) return true;
  return underInstructions && /^(?:attempt\s+(?:all|each|every|any|\d+)|record\s+(?:your|the)\s+(?:answer|choice|confidence|time)|(?:do\s+not|don't)\s+(?:refer|use|consult|open)|write\s+(?:your\s+)?(?:name|roll\s*(?:no|number))|use\s+(?:a|the|your)\s+(?:answer|response)\s+sheet|read\s+(?:all\s+)?instructions\b)/i.test(text);
}

export function parseCbtText(input: string, options: Partial<CbtImportDefaults> = {}): CbtParseResult {
  const mathml = protectCbtMathML(safeSource(input)), source = mathml.source, config = { ...defaults, ...options }, { body, keys, conflicts, warnings } = answerKey(source);
  const markers = [...body.matchAll(/^[ \t]*(?:(?:Q(?:uestion)?\.?[ \t]*)(\d+)[ \t]*[).:：\-]?[ \t]+|(\d+)[ \t]*[).:：\-][ \t]+)(.*)$/gim)]
    .filter(match => !/^[ \t]*Q\.?[ \t]+\d+[ \t]+/i.test(match[0]));
  if (!markers.length) return { questions: [], warnings: [...warnings, 'No numbered questions were recognized. Add clear question numbers and option labels in the extracted text, then parse again.'] };
  if (markers.length > 2000) throw new Error('A paper may contain at most 1,000 questions. Split this source.');
  const pages = [...body.matchAll(/^[ \t]*\[Page\s+(\d+)\][ \t]*$/gim)]; let pageIndex = -1;
  const blocks = markers.map((match, index) => {
    const number = match[1] || match[2], start = match.index! + match[0].length - match[3].length, raw = body.slice(start, markers[index + 1]?.index ?? body.length);
    while (pages[pageIndex + 1] && pages[pageIndex + 1].index! < match.index!) pageIndex++;
    return { raw, explicit: !!match[1], question: parseBlock(raw, number, config, keys.get(normalizeNumber(number)), pageIndex >= 0 ? Number(pages[pageIndex][1]) : undefined, { warnings, conflict: conflicts.has(normalizeNumber(number)) }) };
  });
  const firstQuestion = blocks.findIndex(block => block.explicit || hasQuestionEvidence(block.raw));
  const introduction = body.slice(0, markers[0].index), underInstructions = /\b(?:instructions?|directions?|guidelines?|how\s+to\s+use)\b/i.test(introduction);
  let omitted = 0;
  while (omitted < firstQuestion && !blocks[omitted].explicit && isCbtInstructionBlock(blocks[omitted].raw, underInstructions)) omitted++;
  const questions = blocks.slice(omitted).map(block => block.question);
  if (omitted) warnings.push(omitted + ' leading numbered instruction ' + (omitted === 1 ? 'block was' : 'blocks were') + ' omitted before the test questions. The original text remains editable in Source.');
  if (questions.length > 1000) throw new Error('A paper may contain at most 1,000 questions. Split this source.');
  if (new Set(questions.map(question => question.sourceNumber)).size !== questions.length) warnings.push('Question numbers repeat in this source. Check section boundaries and answer-key mapping carefully.');
  if ([...keys.keys()].some(number => !questions.some(question => normalizeNumber(question.sourceNumber) === number))) warnings.push('Some answer-key entries do not match a recognized question number.');
  return { questions: questions.map(question => ({ ...question, prompt: mathml.restore(question.prompt), options: question.options.map(mathml.restore), explanation: mathml.restore(question.explanation) })), warnings };
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
function tableRows(source: string): string[][] | null {
  const rows: string[][] = []; let row: string[] = [], cell = '', depth = 0, math = '';
  for (let index = 0; index < source.length;) {
    const char = source[index], pair = source.slice(index, index + 2);
    if (char === '\\') {
      if (!math && (pair === '\\(' || pair === '\\[')) math = pair;
      else if (math === '\\(' && pair === '\\)' || math === '\\[' && pair === '\\]') math = '';
      else if (pair === '\\\\' && !depth && !math) {
        row.push(cell.trim()); if (row.some(value => value)) rows.push(row); row = []; cell = ''; index += 2;
        const spacing = /^[ \t]*\[[^\]]*\]/.exec(source.slice(index)); if (spacing) index += spacing[0].length;
        continue;
      }
      cell += pair; index += Math.min(2, source.length - index); continue;
    }
    if (char === '$' && (!math || math === '$' || math === '$$')) {
      const delimiter = source[index + 1] === '$' ? '$$' : '$';
      if (!math) math = delimiter; else if (math === delimiter) math = ''; else return null;
      cell += delimiter; index += delimiter.length; continue;
    }
    if (!math && char === '{') depth++;
    if (!math && char === '}' && --depth < 0) return null;
    if (char === '&' && !depth && !math) { row.push(cell.trim()); cell = ''; index++; continue; }
    cell += char; index++;
  }
  if (depth || math) return null;
  row.push(cell.trim()); if (row.some(value => value)) rows.push(row);
  return rows;
}
function convertTables(input: string, warnings: string[]): { source: string; retained: Map<string, string> } {
  let source = input, cursor = 0; const retained = new Map<string, string>();
  const retain = (original: string) => { let token = '\uE000CBTTABLE' + retained.size + '\uE001'; while (input.includes(token)) token += '\uE001'; retained.set(token, original); return token; };
  for (;;) {
    const marker = /\\begin\{(tabular\*?|tabularx|longtable)\}/.exec(source.slice(cursor)); if (!marker) break;
    const start = cursor + marker.index, table = environment(source.slice(start), marker[1]);
    if (!table) { warnings.push('An incomplete LaTeX table could not be converted. Repair its table boundaries during review.'); source = source.slice(0, start) + retain(source.slice(start)); break; }
    const original = source.slice(start, start + table.end), specStart = table.inner.search(/\S/), firstArg = braced(table.inner, specStart);
    const spec = marker[1] === 'tabularx' && firstArg ? braced(table.inner, firstArg.end + (table.inner.slice(firstArg.end).match(/^\s*/)?.[0].length || 0)) : firstArg;
    const columnSpec = spec?.value.replace(/[\s|]/g, '').replace(/X/g, 'l') || '';
    const body = spec ? table.inner.slice(spec.end) : '';
    const simple = marker[1] !== 'tabular*' && /^[lcr]{1,32}$/.test(columnSpec) && !/\\(?:begin|end|multirow|multicolumn|caption|endhead|endfirsthead|endfoot|endlastfoot|cline|cmidrule|hhline|hlinewd)\b/.test(body) && !body.includes('|');
    const clean = body.replace(/\\(?:toprule|midrule|bottomrule|hline)\b(?:\[[^\]]*\])?/g, '');
    const rows = simple ? tableRows(clean) : null;
    let replacement: string;
    if (rows?.length && rows.length <= 1000 && rows.every(row => row.length === columnSpec.length)) {
      const hasHeader = rows[0].every(cell => /^\\textbf\s*\{/.test(cell));
      const cells = rows.map(row => row.map(cell => latexToStudyText(cell, warnings).replace(/\s*\n\s*/g, ' ').trim()));
      const render = (row: string[]) => '| ' + row.join(' | ') + ' |';
      replacement = '\n\n' + [render(hasHeader ? cells[0] : Array.from({ length: columnSpec.length }, () => '')), render([...columnSpec].map(alignment => alignment === 'c' ? ':---:' : alignment === 'r' ? '---:' : ':---')), ...cells.slice(hasHeader ? 1 : 0).map(render)].join('\n') + '\n\n';
    } else {
      replacement = retain(original);
      warnings.push('A complex or mismatched LaTeX table was kept as source. Review its cells manually; no rows or columns were guessed.');
    }
    source = source.slice(0, start) + replacement + source.slice(start + table.end); cursor = start + replacement.length;
  }
  return { source, retained };
}
/** Converts presentation syntax only; TeX is never compiled, expanded, or allowed to fetch referenced files. */
export function latexToStudyText(input: string, warnings: string[] = []): string {
  const mathml = protectCbtMathML(input, { latexComments: true }), tables = convertTables(mathml.source, warnings);
  let source = tables.source.replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => '$$\n' + math + '\n$$').replace(/\\\(([\s\S]*?)\\\)/g, (_, math: string) => '$' + math + '$');
  source = source.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_, math: string) => '$$\n' + math + '\n$$');
  source = source.replace(/\\begin\{(align\*?)\}([\s\S]*?)\\end\{\1\}/g, (_, _environment: string, math: string) => '$$\n\\begin{aligned}\n' + math + '\n\\end{aligned}\n$$');
  let rendered = source.split(/(\$\$[\s\S]*?\$\$|\$(?:\\.|[^$])*\$)/g).map((part, index) => {
    if (index % 2) return part;
    let text = part;
    for (let pass = 0; pass < 8; pass++) {
      const match = /\\(textbf|textit|emph|underline|textnormal|textrm|textsf|texttt)\s*\{/.exec(text);
      if (!match) break;
      const group = braced(text, match.index + match[0].length - 1); if (!group) break;
      const wrap = match[1] === 'textbf' ? '**' : ['textit', 'emph'].includes(match[1]) ? '*' : '';
      text = text.slice(0, match.index) + wrap + group.value + wrap + text.slice(group.end);
    }
    return text.replace(/\\(?:par|newline)\b/g, '\n\n').replace(/\\\\(?:\[[^\]]*\])?/g, '\n').replace(/\\(?:noindent|smallskip|medskip|bigskip|tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE)\b/g, '').replace(/\\([%&#_])/g, '$1').replace(/~/g, ' ').replace(/\\(?:begin|end)\{(?:questions|parts|document|center)\}/g, '');
  }).join('').trim();
  for (const [token, table] of tables.retained) { const longest = Math.max(0, ...[...table.matchAll(/`+/g)].map(match => match[0].length)), fence = '`'.repeat(Math.max(3, longest + 1)); rendered = rendered.replace(token, '\n\n' + fence + 'tex\n' + table + '\n' + fence + '\n\n'); }
  return mathml.restore(rendered.trim());
}
function environment(source: string, name: string): { start: number; end: number; inner: string } | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp('\\\\(begin|end)\\{' + escaped + '\\}(?:\\[[^\\]]*\\])?', 'g'); let depth = 0, start = -1, contentStart = 0;
  for (const match of source.matchAll(pattern)) { if (match[1] === 'begin') { if (!depth) { start = match.index!; contentStart = start + match[0].length; } depth++; } else if (depth && !--depth) return { start, end: match.index! + match[0].length, inner: source.slice(contentStart, match.index) }; }
  return null;
}
function topItems(source: string): { label: string; body: string }[] {
  const tokens = /\\(?:begin\{([^}]+)\}|end\{([^}]+)\}|item\b\*?(?:\[([^\]]*)\])?)/g, markers: { start: number; end: number; label: string }[] = [];
  let depth = 0;
  for (const token of source.matchAll(tokens)) { if (token[1]) depth++; else if (token[2]) depth = Math.max(0, depth - 1); else if (!depth) markers.push({ start: token.index!, end: token.index! + token[0].length, label: token[3] || '' }); }
  return markers.map((marker, index) => ({ label: marker.label, body: source.slice(marker.end, markers[index + 1]?.start ?? source.length) }));
}
function latexBlock(raw: string, number: string, config: CbtImportDefaults, key?: string, warnings: string[] = [], conflict = false, ast?: LatexAstQuestion): CbtDraftQuestion {
  let source = stripComments(raw).replace(/\\(?:input|include|includegraphics|write18|openout|openin|read|href|url)\b(?:\[[^\]]*\])?\s*\{[^}]*\}(?:\{[^}]*\})?/g, '[External LaTeX content omitted]').replace(/\\(?:answer|correctanswer)\s*\{([^}]*)\}/gi, '\nAnswer: $1\n');
  const solution = environment(source, 'solution'); let explanation = '';
  if (solution) { explanation = latexToStudyText(solution.inner, warnings); source = source.slice(0, solution.start) + source.slice(solution.end); }
  const choices = /\\begin\{(choices|oneparchoices|checkboxes|oneparcheckboxes)\}([\s\S]*?)\\end\{\1\}/i.exec(source);
  const nested = choices || ast ? null : environment(source, 'enumerate');
  let prompt = source, optionTexts: string[] = [], optionLabels: string[] | undefined, explicitCorrect: number[] = [];
  if (ast?.options) {
    optionTexts = ast.options.map(option => latexToStudyText(stripComments(option), warnings)); optionLabels = ast.labels;
  } else if (choices) {
    const markers = [...choices[2].matchAll(/\\(CorrectChoice|choice)\b\*?/gi)];
    optionTexts = markers.map((marker, index) => { if (marker[1].toLowerCase() === 'correctchoice') explicitCorrect.push(index); return latexToStudyText(choices[2].slice(marker.index! + marker[0].length, markers[index + 1]?.index ?? choices[2].length), warnings); });
    prompt = source.slice(0, choices.index) + source.slice(choices.index! + choices[0].length);
  } else if (nested) {
    const items = topItems(nested.inner);
    optionTexts = items.map(item => latexToStudyText(item.body, warnings));
    optionLabels = items.map((item, index) => item.label ? item.label.trim().replace(/^\(?([A-T])\)?[).:]?$/i, '$1').toUpperCase() : String.fromCharCode(65 + index));
    if (/\\item\*/.test(nested.inner)) warnings.push('Question ' + number + ' uses starred list items. Stars are formatting only; no answer was inferred from them.');
    prompt = source.slice(0, nested.start) + source.slice(nested.end);
  }
  const parsed = parseBlock(latexToStudyText(prompt, warnings), number, config, key, undefined, {
    warnings, conflict, ...(ast?.options || optionTexts.length ? { options: optionTexts, labels: optionLabels, multiple: choices?.[1].toLowerCase().includes('checkboxes') } : {}),
    key: explicitCorrect.length ? explicitCorrect.map(index => String.fromCharCode(65 + index)).join(',') : undefined,
  });
  if (explanation) parsed.explanation = explanation;
  if (ast?.metadata) {
    parsed.sourceMetadata = ast.metadata;
    const difficulty = ast.metadata.difficulty?.toLowerCase();
    if (difficulty && /^(easy|medium|moderate|hard|tough)$/.test(difficulty)) parsed.difficulty = difficulty === 'easy' ? 'Easy' : /medium|moderate/.test(difficulty) ? 'Moderate' : 'Tough';
    const tags = [ast.metadata.competency ? `Competency: ${ast.metadata.competency}` : '', ast.metadata.source ? `Source: ${ast.metadata.source}` : ''].filter(Boolean);
    if (tags.length) parsed.prompt += '\n\n' + tags.join(' · ');
  }
  return parsed;
}
export function parseCbtLatex(input: string, options: Partial<CbtImportDefaults> = {}): CbtParseResult {
  const mathml = protectCbtMathML(safeSource(input), { latexComments: true }), source = mathml.source, warnings: string[] = [], config = { ...defaults, ...options };
  const uncommented = stripComments(source);
  if ([...uncommented.matchAll(/\\begin\{questionblock\}/g)].length !== [...uncommented.matchAll(/\\end\{questionblock\}/g)].length) return { questions: [], warnings: ['Some questionblock containers are incomplete. Repair the source before importing its questions.'] };
  if (/\\(?:input|include|includegraphics|write18|openout|openin|read|href|url)\b/.test(source)) warnings.push('External files, images, links, and executable LaTeX commands are not loaded or executed. Add any missing image content manually.');
  let structure: ReturnType<typeof parseLatexStructure>;
  try { structure = parseLatexStructure(source); }
  catch (error) {
    if (/\\begin\{questionblock\}/.test(source) && !/\\end\{questionblock\}/.test(source)) return { questions: [], warnings: ['Some questionblock containers are incomplete. Repair the source before importing its questions.'] };
    throw new Error('The LaTeX structure could not be read. Check unmatched groups and environments. ' + (error instanceof Error ? error.message.slice(0, 180) : ''));
  }
  warnings.push(...structure.warnings);
  const key = answerKey(latexToStudyText(stripComments(source)));
  let questions = structure.questions.map(block => latexBlock(block.source, block.sourceNumber, config, key.keys.get(normalizeNumber(block.sourceNumber)), warnings, key.conflicts.has(normalizeNumber(block.sourceNumber)), block));
  if (!questions.length) {
    const fallbackWarnings: string[] = [], fallback = parseCbtText(latexToStudyText(stripComments(structure.questionSource), fallbackWarnings), config);
    warnings.push(...fallback.warnings, ...fallbackWarnings); questions = fallback.questions;
    for (const question of questions) {
      const number = normalizeNumber(question.sourceNumber), supplied = key.keys.get(number);
      const existing = question.kind === 'numeric' && question.numericAnswer !== undefined ? question.numericAnswer + ' ± ' + (question.tolerance || 0) : question.correctAnswers.map(index => question.sourceOptionLabels?.[index]).filter(Boolean).join(',') || undefined;
      const resolved = key.conflicts.has(number) ? undefined : resolveKey([existing, supplied], question.sourceNumber, warnings);
      if (key.conflicts.has(number) || (existing && supplied && !resolved)) { question.correctAnswers = []; delete question.numericAnswer; }
      else applyKey(question, resolved, question.sourceOptionLabels || []);
    }
  }
  if (new Set(questions.map(question => normalizeNumber(question.sourceNumber))).size !== questions.length) warnings.push('Question numbers repeat in this source. Check section boundaries and answer-key mapping carefully.');
  return { questions: questions.map(question => ({ ...question, prompt: mathml.restore(question.prompt), options: question.options.map(mathml.restore), explanation: mathml.restore(question.explanation), ...(question.sourceMetadata ? { sourceMetadata: Object.fromEntries(Object.entries(question.sourceMetadata).map(([key, value]) => [key, mathml.restore(value)])) } : {}) })), warnings: [...new Set([...warnings, ...key.warnings])], ...(structure.embeddedSource ? { embeddedSource: mathml.restore(structure.embeddedSource) } : {}) };
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
