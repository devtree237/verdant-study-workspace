const superscripts: Record<string, string> = Object.fromEntries(Array.from('0123456789+-=()').map((character, index) => [character, Array.from('⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾')[index]]));
const subscripts: Record<string, string> = Object.fromEntries(Array.from('0123456789+-=()').map((character, index) => [character, Array.from('₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎')[index]]));
Object.assign(superscripts, { n: 'ⁿ', i: 'ⁱ', '−': '⁻' });
Object.assign(subscripts, { a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ', '−': '₋' });

/** Returns null rather than dropping a character for which Unicode has no script. */
export function toUnicodeScript(text: string, kind: 'sup' | 'sub'): string | null {
  const mapping = kind === 'sup' ? superscripts : subscripts;
  const characters = Array.from(text);
  if (!characters.length || characters.some(character => !mapping[character])) return null;
  return characters.map(character => mapping[character]).join('');
}

function escaped(source: string, index: number): boolean {
  let slashes = 0;
  while (index > 0 && source[--index] === '\\') slashes++;
  return slashes % 2 === 1;
}

function groupAt(source: string, start: number): { body: string; end: number } | null {
  if (source[start] !== '{') return null;
  let depth = 1;
  for (let index = start + 1; index < source.length; index++) {
    if (escaped(source, index)) continue;
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) return { body: source.slice(start + 1, index), end: index + 1 };
  }
  return null;
}

function replaceMathTextScripts(source: string): string {
  return source.replace(/\\text(sub|super)script\{([^{}]*)\}/g, (_match, kind: string, content: string) => `${kind === 'sub' ? '_' : '^'}{\\text{${content}}}`);
}

function closingDelimiter(source: string, delimiter: string, from: number): number {
  for (let index = source.indexOf(delimiter, from); index !== -1; index = source.indexOf(delimiter, index + delimiter.length)) {
    if (!escaped(source, index)) return index;
  }
  return -1;
}

function closingCodeRun(source: string, delimiter: string, from: number): number {
  for (let index = source.indexOf(delimiter, from); index !== -1; index = source.indexOf(delimiter, index + delimiter.length)) {
    if (source[index - 1] !== '`' && source[index + delimiter.length] !== '`') return index;
  }
  return -1;
}

/** Display-only conversion of explicitly marked notation. It never guesses a
 * formula from ordinary words/numbers, executes TeX, or modifies stored text. */
export function normalizeScientificMarkdown(source: string): string { return processScientificMarkdown(source, false).source; }

export type ScientificMarkdownSource = { source: string; mathML: ReadonlyMap<string, string> };
/** MathML is held out of the Markdown/HTML parser, including its dollar signs,
 * TeX annotations and line breaks. Only the dedicated validator handles it. */
export function prepareScientificMarkdown(source: string): ScientificMarkdownSource { return processScientificMarkdown(source, true); }
function processScientificMarkdown(source: string, shieldMathML: boolean): ScientificMarkdownSource {
  const mathML = new Map<string, string>();
  let mathMLPrefix = 'VDMML';
  while (source.includes(mathMLPrefix)) mathMLPrefix += 'X';
  let output = '';
  let index = 0;
  while (index < source.length) {
    const lineStart = index === 0 || source[index - 1] === '\n';
    if (lineStart) {
      const fence = /^( {0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(source.slice(index));
      if (fence) {
        const marker = fence[2][0], length = fence[2].length;
        const close = new RegExp(`^ {0,3}${marker === '`' ? '`' : '~'}{${length},}[ \\t]*$`, 'm');
        const restStart = index + fence[0].length;
        const match = close.exec(source.slice(restStart));
        const end = match ? restStart + match.index + match[0].length : source.length;
        output += source.slice(index, end); index = end; continue;
      }
    }
    if (source[index] === '`' && !escaped(source, index)) {
      const run = /^`+/.exec(source.slice(index))![0];
      const end = closingCodeRun(source, run, index + run.length);
      if (end !== -1) { output += source.slice(index, end + run.length); index = end + run.length; continue; }
    }
    if (source[index] === '$' && !escaped(source, index)) {
      const delimiter = source[index + 1] === '$' ? '$$' : '$';
      const end = closingDelimiter(source, delimiter, index + delimiter.length);
      if (end !== -1) {
        const body = replaceMathTextScripts(source.slice(index + delimiter.length, end));
        // remark-math needs line-separated display delimiters; a same-line $$
        // pair otherwise becomes inline math and can overflow a narrow card.
        output += delimiter === '$$' ? `\n\n$$\n${body.trim()}\n$$\n\n` : `$${body}$`;
        index = end + delimiter.length; continue;
      }
    }
    if (source[index] === '\\' && !escaped(source, index)) {
      const opener = source.slice(index, index + 2);
      if (opener === '\\(' || opener === '\\[') {
        const end = closingDelimiter(source, opener === '\\(' ? '\\)' : '\\]', index + 2);
        if (end !== -1) {
          const math = replaceMathTextScripts(source.slice(index + 2, end));
          output += opener === '\\(' ? `$${math}$` : `\n\n$$\n${math.trim()}\n$$\n\n`;
          index = end + 2; continue;
        }
      }
      const command = /^\\(textsubscript|textsuperscript|ce|pu)\s*/.exec(source.slice(index));
      if (command) {
        const group = groupAt(source, index + command[0].length);
        if (group) {
          if (command[1] === 'ce' || command[1] === 'pu') output += `$${source.slice(index, group.end)}$`;
          else {
            const kind = command[1] === 'textsubscript' ? 'sub' : 'sup';
            const unicode = toUnicodeScript(group.body, kind);
            // The math renderer handles scripts that have no Unicode glyph.
            output += unicode ?? `$${kind === 'sub' ? '_' : '^'}{\\text{${group.body}}}$`;
          }
          index = group.end; continue;
        }
      }
    }
    if (source[index] === '<') {
      const mathTag = /^<(?:[a-zA-Z][\w.-]*:)?math(?=[\s/>])[^>]*>/i.exec(source.slice(index));
      if (mathTag) {
        const close = /<\/(?:[a-zA-Z][\w.-]*:)?math\s*>/gi;
        close.lastIndex = index + mathTag[0].length;
        const closing = close.exec(source);
        const end = /\/\s*>$/.test(mathTag[0]) ? index + mathTag[0].length : closing ? closing.index + closing[0].length : -1;
        if (end !== -1) {
          const fragment = source.slice(index, end);
          if (shieldMathML) { const token = `${mathMLPrefix}${mathML.size}`; mathML.set(token, fragment); output += `$${token}$`; }
          else output += fragment;
          index = end; continue;
        }
      }
      const tag = /^<(sub|sup)>([^<>\n]*)<\/\1>/i.exec(source.slice(index));
      if (tag) {
        const unicode = toUnicodeScript(tag[2], tag[1].toLowerCase() as 'sub' | 'sup');
        if (unicode) { output += unicode; index += tag[0].length; continue; }
      }
    }
    output += source[index++];
  }
  return { source: output, mathML };
}
