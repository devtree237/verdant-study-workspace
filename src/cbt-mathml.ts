import { sanitizeMathML } from './mathml';

/** Keep complete MathML opaque to TeX macros, numbered lists, option labels and
 * answer headings. Restoring source is a text operation, never HTML insertion. */
export function protectCbtMathML(input: string, { latexComments = false }: { latexComments?: boolean } = {}): { source: string; fragments: readonly string[]; restore: (value: string) => string } {
  if (!/<(?:[A-Za-z_][\w.-]*:)?math(?=[\s/>])/i.test(input)) return { source: input, fragments: [], restore: value => value };
  const used = new Set([...input.matchAll(/VERDANTOPAQUEMATHML\d+TOKEN/g)].map(match => match[0]));
  let suffix = 0, prefix = 'VERDANTOPAQUEMATHML0TOKEN';
  while (used.has(prefix)) prefix = `VERDANTOPAQUEMATHML${++suffix}TOKEN`;
  const fragments: string[] = [], parts: string[] = [];
  const tags = /<\/?(?:[A-Za-z_][\w.-]*:)?math\b(?:"[^"]*"|'[^']*'|[^'">])*?>/gi;
  let depth = 0, start = 0, cursor = 0, scanAt = 0, inComment = false;
  const scanOutside = (until: number) => {
    for (; scanAt < until; scanAt++) {
      if (input[scanAt] === '\n') inComment = false;
      else if (!inComment && input[scanAt] === '%') { let slashes = 0; for (let previous = scanAt - 1; previous >= 0 && input[previous] === '\\'; previous--) slashes++; if (slashes % 2 === 0) inComment = true; }
    }
  };
  for (const match of input.matchAll(tags)) {
    if (latexComments && depth === 0) { scanOutside(match.index!); if (inComment) { scanOutside(match.index! + match[0].length); continue; } }
    const closing = /^<\//.test(match[0]), selfClosing = /\/\s*>$/.test(match[0]);
    if (!closing) { if (depth === 0) start = match.index!; if (!selfClosing) depth++; }
    else { if (!depth) throw new Error('A MathML closing tag has no matching <math> opening tag. Repair the source before importing.'); depth--; }
    if (depth === 0) {
      if (fragments.length >= 50_000) throw new Error('This source contains too many MathML blocks. Split it into smaller papers.');
      const end = match.index! + match[0].length;
      parts.push(input.slice(cursor, start), `${prefix}${fragments.length}END`);
      fragments.push(input.slice(start, end)); cursor = end;
    }
    scanAt = match.index! + match[0].length;
  }
  if (depth) throw new Error('A MathML <math> block is incomplete. Add its closing </math> tag before importing.');
  parts.push(input.slice(cursor));
  const tokens = new RegExp(`${prefix}(\\d+)END`, 'g');
  return { source: parts.join(''), fragments: Object.freeze(fragments), restore: value => value.replace(tokens, (token, number: string) => fragments[Number(number)] ?? token) };
}

/** Standalone files contain an equation snippet, not a question paper. Loading
 * one leaves the real source editable; parsing cannot invent a stem or key. */
export async function readCbtMathMLSnippet(file: Pick<File, 'name' | 'size' | 'arrayBuffer'>): Promise<string> {
  if (!/\.(?:mml|mathml)$/i.test(file.name)) throw new Error('Choose a .mml or .mathml equation snippet. General XML and HTML files are not imported.');
  if (!file.size) throw new Error('This MathML file is empty.');
  if (file.size > 1024 * 1024) throw new Error('Choose a MathML source smaller than 1 MB.');
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); } catch { throw new Error('Save this MathML file as UTF-8 text and try again.'); }
  return sanitizeMathML(source).source;
}
