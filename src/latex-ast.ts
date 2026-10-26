import { parseMinimal } from '@unified-latex/unified-latex-util-parse';

export type LatexSourceMetadata = { competency?: string; difficulty?: string; source?: string };
export type LatexAstQuestion = { sourceNumber: string; source: string; options?: string[]; labels?: string[]; correctLabels?: string[]; multiple?: boolean; metadata?: LatexSourceMetadata };
export type LatexAstResult = { questions: LatexAstQuestion[]; questionSource: string; embeddedSource?: string; warnings: string[] };
type Node = ReturnType<typeof parseMinimal>['content'][number];
type Env = Extract<Node, { type: 'environment' | 'mathenv' }>;
type Item = { label: string; nodes: Node[]; starred: boolean; number?: number };
const layouts = new Set(['document', 'questions', 'center', 'multicols', 'multicols*', 'columns', 'column', 'minipage']);
const macro = (node: Node, name: string) => node.type === 'macro' && node.content.toLowerCase() === name.toLowerCase();
const start = (node: Node) => node.position?.start.offset ?? 0;
const end = (node: Node) => node.position?.end.offset ?? start(node);
const ignorable = (node: Node) => ['whitespace', 'parbreak', 'comment'].includes(node.type);
// parseMinimal keeps a math environment's name as a syntax node at runtime;
// math remains opaque here so it cannot affect question/list nesting.
const isEnv = (node: Node): node is Env => node.type === 'environment' && typeof node.env === 'string';
const stopTitle = /^(?:(?:section\s*[-:–—]?\s*[cd])\b|answer\s*key\b|self[\s-]*analysis\b|(?:detailed\s+)?solutions?\b)/i;

/** Only syntax is parsed. No macro is expanded, TeX is never executed, and no referenced file is opened. */
export function parseLatexStructure(source: string): LatexAstResult {
  const tree = parseMinimal(source), warnings: string[] = [], questions: LatexAstQuestion[] = [];
  let stopAt: number | undefined, nodesSeen = 0;
  const raw = (node: Node) => source.slice(start(node), end(node));
  const check = (depth: number) => { if (depth > 100 || ++nodesSeen > 250_000) throw new Error('This LaTeX document is too deeply nested or complex. Split it into smaller papers.'); };
  const plain = (value: string) => value.replace(/%[^\n]*/g, '').replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, ' ').replace(/[{}$]/g, '').replace(/\s+/g, ' ').trim();
  function groupArgs(nodes: Node[], index: number, count: number): { args: string[]; next: number } {
    const args: string[] = []; let next = index + 1;
    while (args.length < count) { while (nodes[next] && ignorable(nodes[next])) next++; const node = nodes[next]; if (!node || node.type !== 'group') break; args.push(source.slice(start(node) + 1, end(node) - 1)); next++; }
    return { args, next };
  }
  function heading(nodes: Node[], index: number): boolean {
    const node = nodes[index]; let text = '';
    if (node.type === 'macro' && /^(?:section|subsection|subsubsection|chapter|part|paragraph|title)$/i.test(node.content)) {
      let next = index + 1; const starred = nodes[next]; if (starred?.type === 'string' && starred.content === '*') next++;
      while (nodes[next] && ignorable(nodes[next])) next++;
      if (nodes[next]?.type === 'group') text = plain(raw(nodes[next]));
    } else if (node.type === 'macro' && /^(?:textbf|textsc|fbox|mbox)$/i.test(node.content)) text = plain(groupArgs(nodes, index, 1).args[0] || '');
    else if (node.type === 'group') text = plain(raw(node));
    else if (node.type === 'string') {
      const lineStart = source.lastIndexOf('\n', start(node) - 1) + 1, lineEnd = source.indexOf('\n', end(node));
      const line = plain(source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd));
      if (/^(?:answer\s*key|self[\s-]*analysis|section\s*[cd]|(?:detailed\s+)?solutions?)\s*[:：]?$/i.test(line)) { stopAt = Math.min(stopAt ?? Infinity, lineStart); return true; }
    }
    if (text.length <= 240 && stopTitle.test(text)) { stopAt = Math.min(stopAt ?? Infinity, start(node)); return true; }
    return false;
  }
  function envContent(node: Env): Node[] {
    if (!['multicols', 'multicols*', 'column', 'minipage', 'questionblock'].includes(node.env)) return node.content;
    const first = node.content.findIndex(item => !ignorable(item));
    if (node.content[first]?.type === 'group') return node.content.slice(first + 1);
    return node.content;
  }
  function unwrap(nodes: Node[], depth = 0): Node[] {
    const output: Node[] = [];
    for (const node of nodes) { check(depth); if (isEnv(node) && layouts.has(node.env)) { if (/multicols|column|minipage/.test(node.env)) warnings.push('Column containers were read in their LaTeX source order. Check question boundaries, option labels, and any diagrams during review.'); output.push(...unwrap(envContent(node), depth + 1)); } else output.push(node); }
    return output;
  }
  function labelHeader(node: Node): { label: string; until: number; starred: boolean } {
    let position = end(node); const suffix = source.slice(position); const starred = suffix.startsWith('*'); if (starred) position++;
    while (/[ \t]/.test(source[position] || '')) position++;
    if (source[position] !== '[') return { label: '', until: position, starred };
    let depth = 1, closing = position + 1;
    for (; closing < source.length && depth; closing++) { if (source[closing] === '\\') { closing++; continue; } if (source[closing] === '[') depth++; if (source[closing] === ']') depth--; }
    return depth ? { label: '', until: position, starred } : { label: source.slice(position + 1, closing - 1).trim(), until: closing, starred };
  }
  function listItems(node: Env, numbered = false, initialCounter?: number): Item[] {
    const items: Item[] = []; let current: Item | undefined;
    const suppliedStart = /\[\s*[^\]]*\bstart\s*=\s*(\d+)/.exec(settings(node))?.[1];
    let counter = suppliedStart ? Number(suppliedStart) - 1 : initialCounter ?? 0;
    for (let index = 0; index < node.content.length; index++) {
      const entry = node.content[index];
      if (numbered && entry.type === 'macro' && /^(?:section|subsection|chapter|part)$/i.test(entry.content) && heading(node.content, index)) break;
      if (macro(entry, 'setcounter')) {
        const args = groupArgs(node.content, index, 2);
        if (args.args[0]?.trim() === 'enumi' && /^\d+$/.test(args.args[1]?.trim() || '')) { counter = Number(args.args[1]); index = args.next - 1; continue; }
      }
      if (macro(entry, 'item')) {
        const header = labelHeader(entry); current = { label: header.label, nodes: [], starred: header.starred, ...(numbered ? { number: ++counter } : {}) }; items.push(current);
        while (node.content[index + 1] && start(node.content[index + 1]) < header.until) index++;
      } else if (current) current.nodes.push(entry);
    }
    return items;
  }
  function settings(node: Env): string { const firstItem = node.content.find(item => macro(item, 'item')); return source.slice(start(node), firstItem ? start(firstItem) : end(node)); }
  function statementLabel(node: Env, index: number): string {
    const style = settings(node), number = index + 1;
    if (/\\(?:roman|Roman)\b/.test(style)) { let value = number, label = ''; for (const [digit, symbol] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as const) while (value >= digit) { label += symbol; value -= digit; } return '(' + (/\\Roman\b/.test(style) ? label : label.toLowerCase()) + ')'; }
    return node.env === 'itemize' ? '-' : number + '.';
  }
  function choiceList(node: Env): { items: Item[]; labels: string[]; explicit: boolean } | null {
    if (!['enumerate', 'itemize'].includes(node.env)) return null;
    const items = listItems(node); if (items.length < 2 || items.length > 20) return null;
    const custom = items.map(item => item.label.replace(/^\(([^()]*)\)$/, '$1').replace(/[).:]$/, ''));
    const options = settings(node);
    if (items.every(item => !item.label)) {
      if (/\\(?:roman|Roman|arabic)\b/.test(options) || node.env === 'itemize') return null;
      return { items, labels: items.map((_, index) => String.fromCharCode(65 + index)), explicit: /\\(?:alph|Alph)\b/.test(options) };
    }
    if (custom.every(label => /^[a-d]$/i.test(label)) && new Set(custom.map(label => label.toUpperCase())).size === custom.length) return { items, labels: custom.map(label => label.toUpperCase()), explicit: true };
    return null;
  }
  function render(nodes: Node[], metadata?: LatexSourceMetadata, omit?: Node, depth = 0): string {
    let output = '';
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]; check(depth); if (node === omit || node.type === 'comment') continue;
      if (macro(node, 'qmeta')) {
        const values = groupArgs(nodes, index, 3); index = values.next - 1;
        if (values.args.length === 3 && metadata) { metadata.competency = plain(values.args[0]); metadata.difficulty = plain(values.args[1]); metadata.source = plain(values.args[2]); }
        else if (values.args.length !== 3) { output += raw(node); warnings.push('An incomplete qmeta tag was retained. Check its metadata during review.'); }
        continue;
      }
      if (isEnv(node) && layouts.has(node.env)) output += '\n' + render(envContent(node), metadata, omit, depth + 1) + '\n';
      else if (isEnv(node) && ['enumerate', 'itemize'].includes(node.env)) {
        const items = listItems(node);
        output += '\n' + items.map((item, index) => (item.label || statementLabel(node, index)) + ' ' + render(item.nodes, metadata, omit, depth + 1).trim()).join('\n\n') + '\n';
      } else if (node.type === 'group') output += '{' + render(node.content, metadata, omit, depth + 1) + '}';
      else if (node.type === 'parbreak') output += '\n\n';
      else if (node.type === 'whitespace') output += raw(node) || ' ';
      else output += raw(node);
    }
    return output;
  }
  let directions: { options: string[]; labels: string[] } | undefined;
  function emit(nodes: Node[], sourceNumber: string) {
    if (questions.length >= 1000) throw new Error('A paper may contain at most 1,000 questions. Split this source.');
    const metadata: LatexSourceMetadata = {}, candidates: { node: Env; list: NonNullable<ReturnType<typeof choiceList>> }[] = [];
    function find(content: Node[], depth = 0) {
      for (const node of content) { check(depth); if (!isEnv(node)) continue;
        if (['choices', 'oneparchoices', 'checkboxes', 'oneparcheckboxes'].includes(node.env.toLowerCase())) continue;
        const list = choiceList(node); if (list) candidates.push({ node, list });
        else if (layouts.has(node.env)) find(envContent(node), depth + 1);
      }
    }
    find(nodes);
    const explicit = candidates.filter(candidate => candidate.list.explicit), valid = explicit.length ? explicit : candidates;
    const selected = valid.length === 1 ? valid[0] : undefined;
    if (valid.length > 1) warnings.push('Question ' + sourceNumber + ' has more than one possible option list. No option list was guessed; select its choices manually.');
    let prompt = render(nodes, metadata, selected?.node).trim();
    let optionTexts = selected?.list.items.map(item => render(item.nodes).trim()), labels = selected?.list.labels;
    if (selected?.list.items.some(item => item.starred)) warnings.push('Question ' + sourceNumber + ' uses starred list items. Stars are formatting only; no answer was inferred from them.');
    if (directions && /\bassertion\b[\s\S]*\breason\b/i.test(plain(prompt))) {
      if (!optionTexts) { optionTexts = [...directions.options]; labels = [...directions.labels]; }
      else optionTexts = optionTexts.map(option => { const reference = /^(?:option\s*)?\(([a-d])\)\s*[.]?$/i.exec(plain(option)); return reference ? directions!.options[directions!.labels.indexOf(reference[1].toUpperCase())] || option : option; });
    } else if (!directions && optionTexts?.some(option => /^option\s*\([a-d]\)\s*[.]?$/i.test(plain(option)))) warnings.push('Question ' + sourceNumber + ' references Option (a)–(d), but no explicit preceding Assertion–Reason directions were found. The option references were retained for manual review.');
    if (!Object.keys(metadata).length) prompt = prompt.trim();
    questions.push({ sourceNumber, source: prompt, ...(optionTexts ? { options: optionTexts, labels } : valid.length > 1 ? { options: [] } : {}), ...(Object.keys(metadata).length ? { metadata } : {}) });
  }
  const document = tree.content.find(node => isEnv(node) && node.env === 'document');
  const scope = unwrap(document && isEnv(document) ? document.content : tree.content);
  let lead = '', examNumber = 0, pendingCounter: number | undefined;
  for (let index = 0; index < scope.length; index++) {
    const node = scope[index]; if (heading(scope, index)) break;
    if (macro(node, 'setcounter')) { const values = groupArgs(scope, index, 2); if (values.args[0] === 'enumi' && /^\d+$/.test(values.args[1] || '')) { pendingCounter = Number(values.args[1]); index = values.next - 1; continue; } }
    if (isEnv(node) && node.env === 'questionblock') {
      const first = node.content.findIndex(item => !ignorable(item)), label = node.content[first];
      const number = label?.type === 'group' ? plain(raw(label)) : String(questions.length + 1);
      emit(envContent(node), number); lead = ''; continue;
    }
    if (isEnv(node) && node.env === 'enumerate') {
      const list = choiceList(node);
      if (list?.explicit && /directions/i.test(plain(lead)) && /assertion|reason/i.test(plain(lead)) && list.items.length === 4) { directions = { options: list.items.map(item => render(item.nodes).trim()), labels: list.labels }; lead = ''; continue; }
      for (const item of listItems(node, true, pendingCounter)) { if (item.label && !/^\(?\d+\)?[).:]?$/.test(item.label)) continue; emit(item.nodes, item.label.replace(/[^0-9]/g, '') || String(item.number)); }
      pendingCounter = undefined; lead = ''; if (stopAt !== undefined) break; continue;
    }
    if (macro(node, 'question')) {
      const header = labelHeader(node), body: Node[] = [];
      while (scope[index + 1] && !macro(scope[index + 1], 'question') && !heading(scope, index + 1)) { const next = scope[++index]; if (start(next) >= header.until) body.push(next); }
      const part = body.find(entry => isEnv(entry) && entry.env === 'parts');
      const number = String(++examNumber);
      if (part && isEnv(part)) {
        const stem = body.slice(0, body.indexOf(part)); let partNumber = 0, content: Node[] = [];
        const flush = () => { if (partNumber) emit([...stem, ...content], number + String.fromCharCode(96 + partNumber)); };
        for (let partIndex = 0; partIndex < part.content.length; partIndex++) { const entry = part.content[partIndex]; if (macro(entry, 'part')) { flush(); content = []; partNumber++; const header = labelHeader(entry); while (part.content[partIndex + 1] && start(part.content[partIndex + 1]) < header.until) partIndex++; } else content.push(entry); } flush();
      } else emit(body, number);
      if (stopAt !== undefined) break; continue;
    }
    lead += render([node]);
  }
  const questionSource = stopAt === undefined ? source : source.slice(0, stopAt);
  return { questions, questionSource, ...(stopAt === undefined ? {} : { embeddedSource: source.slice(stopAt) }), warnings: [...new Set(warnings)] };
}
