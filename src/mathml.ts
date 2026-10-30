export type SafeMathML = { source: string; display: boolean; plainText: string };

const tags = new Set('math mrow mi mn mo mtext ms mspace mfrac msqrt mroot mstyle merror mpadded mphantom mfenced menclose msub msup msubsup munder mover munderover mmultiscripts mprescripts none mtable mtr mlabeledtr mtd semantics annotation'.split(' '));
const attributes = new Set('display mathvariant mathsize displaystyle scriptlevel stretchy fence separator form accent accentunder largeop movablelimits symmetric lspace rspace width height depth voffset linethickness numalign denomalign bevelled open close separators notation rowalign columnalign rowspacing columnspacing rowlines columnlines frame framespacing equalrows equalcolumns side minlabelspacing columnspan rowspan dir encoding'.split(' '));
const entities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', divide: '÷', minus: '−', plusmn: '±', middot: '·', sdot: '⋅', infin: '∞', radic: '√', int: '∫', sum: '∑', prod: '∏', part: '∂', nabla: '∇',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡',
  rarr: '→', larr: '←', harr: '↔', rArr: '⇒', lArr: '⇐', hArr: '⇔', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', RightArrow: '→', LeftArrow: '←',
  InvisibleTimes: '\u2062', ApplyFunction: '\u2061', DifferentialD: 'ⅆ', ExponentialE: 'ⅇ', ImaginaryI: 'ⅈ',
};
const lengthAttributes = new Set('mathsize lspace rspace width height depth voffset linethickness rowspacing columnspacing framespacing minlabelspacing'.split(' '));
function checkAttributeBounds(key: string, value: string): void {
  if (key === 'scriptlevel' && !/^[+-]?[0-5]$/.test(value)) throw new Error('MathML script levels must be between -5 and 5.');
  if ((key === 'columnspan' || key === 'rowspan') && (!/^\d{1,2}$/.test(value) || Number(value) < 1 || Number(value) > 40)) throw new Error('MathML table spans must be between 1 and 40.');
  if (key === 'displaystyle' && !['true', 'false'].includes(value)) throw new Error('MathML displaystyle must be true or false.');
  if (key === 'mathvariant' && !/^(?:normal|bold|italic|bold-italic|double-struck|bold-fraktur|script|bold-script|fraktur|sans-serif|bold-sans-serif|sans-serif-italic|sans-serif-bold-italic|monospace|initial|tailed|looped|stretched)$/.test(value)) throw new Error('This MathML font variant is not supported.');
  if (!lengthAttributes.has(key)) return;
  for (const token of value.trim().split(/\s+/)) {
    if (/^(?:normal|small|big|thin|medium|thick|(?:negative)?(?:veryverythin|verythin|thin|medium|thick|verythick|veryverythick)mathspace)$/.test(token)) continue;
    const length = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(em|ex|px|pt|pc|in|cm|mm|%)?$/.exec(token);
    if (!length) throw new Error('MathML dimensions must use a supported, bounded length.');
    const amount = Number(length[1]), unit = length[2] || 'em';
    const em = amount * ({ em: 1, ex: .5, px: 1 / 16, pt: 1 / 12, pc: 1, in: 6, cm: 6 / 2.54, mm: .6 / 2.54, '%': .01 }[unit]!);
    if (!Number.isFinite(em) || Math.abs(em) > (key === 'mathsize' ? 4 : 20) || key === 'mathsize' && em <= 0) throw new Error('MathML dimensions exceed the safe display size.');
  }
}

function escapeXML(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function decodeEntities(value: string): string {
  if (/&(?!(?:#[0-9]{1,7}|#x[\da-fA-F]{1,6}|[a-zA-Z]{1,32});)/.test(value)) throw new Error('MathML contains an invalid entity. Use literal mathematical characters or numeric entities.');
  return value.replace(/&([^;]+);/g, (_match, entity: string) => {
    if (entity[0] !== '#') {
      if (!Object.hasOwn(entities, entity)) throw new Error(`MathML entity &${entity}; is not supported. Use its literal mathematical character.`);
      return entities[entity];
    }
    const number = entity[1] === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    if (!Number.isInteger(number) || number < 32 && number !== 9 && number !== 10 && number !== 13 || number > 0x10ffff || number >= 0xd800 && number <= 0xdfff || number === 0xfffe || number === 0xffff) throw new Error('MathML contains an invalid character reference.');
    return String.fromCodePoint(number);
  });
}

/** A bounded, non-executing Presentation MathML reader. No browser HTML/XML
 * parser, external entity resolution, URL, CSS or event handler is involved. */
export function sanitizeMathML(input: string): SafeMathML {
  if (input.length > 64_000) throw new Error('This MathML expression is too large. Split it into smaller expressions.');
  const source = input.trim();
  if (!source || /<\s*[!?]|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source)) throw new Error('MathML must contain only a Presentation MathML expression, without XML declarations, entities or scripts.');
  let index = 0, nodes = 0, output = '', plainText = '', display = false;
  const stack: string[] = [];
  let rootClosed = false;
  while (index < source.length) {
    if (source[index] !== '<') {
      const end = source.indexOf('<', index), text = decodeEntities(source.slice(index, end === -1 ? source.length : end));
      if (!stack.length && text.trim()) throw new Error('Text outside the MathML expression is not supported.');
      if (stack.length) { output += escapeXML(text); if (!stack.includes('annotation')) plainText += text; }
      index = end === -1 ? source.length : end; continue;
    }
    let end = index + 1, quote = '';
    for (; end < source.length; end++) {
      const character = source[end];
      if (quote) { if (character === quote) quote = ''; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
    }
    if (end === source.length || quote) throw new Error('MathML contains an incomplete tag.');
    const token = source.slice(index + 1, end), closing = token.startsWith('/');
    if (closing) {
      const match = /^\/([a-zA-Z][\w.-]*(?::[a-zA-Z][\w.-]*)?)\s*$/.exec(token);
      const name = match?.[1].split(':').at(-1);
      if (!name || stack.pop() !== name) throw new Error('MathML tags must be correctly nested.');
      output += `</${name}>`; if (!stack.length) rootClosed = true;
    } else {
      const match = /^([a-zA-Z][\w.-]*(?::[a-zA-Z][\w.-]*)?)/.exec(token);
      const name = match?.[1].split(':').at(-1);
      if (!match || !name || !tags.has(name) || rootClosed || stack.at(-1) === 'annotation') throw new Error('Only safe Presentation MathML elements are supported.');
      if (name === 'annotation' && stack.at(-1) !== 'semantics') throw new Error('MathML annotations must belong to a semantics element.');
      if (!stack.length && name !== 'math' || stack.length && name === 'math') throw new Error('MathML must have one outer math element.');
      if (++nodes > 4096 || stack.length > 80) throw new Error('This MathML expression is too complex. Split it into smaller expressions.');
      const selfClosing = /\/\s*$/.test(token);
      const remainder = token.slice(match[0].length).replace(/\/\s*$/, '');
      let offset = 0, attrs = '';
      const seen = new Set<string>();
      while (offset < remainder.length) {
        if (!remainder.slice(offset).trim()) break;
        const attr = /^\s+([a-zA-Z][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(remainder.slice(offset));
        if (!attr) throw new Error('MathML attributes must use quoted values.');
        offset += attr[0].length;
        const key = attr[1], value = decodeEntities(attr[2] ?? attr[3]);
        if (seen.has(key)) throw new Error('MathML contains a duplicate attribute.');
        seen.add(key);
        if (key === 'xmlns' || key.startsWith('xmlns:')) {
          if (stack.length || value !== 'http://www.w3.org/1998/Math/MathML') throw new Error('Only the MathML namespace is supported.');
          continue;
        }
        if (!attributes.has(key) || value.length > 200 || /[<>\u0000-\u001f]|(?:url\s*\(|https?:|javascript:|data:|\/\/)/i.test(value)) throw new Error('MathML links, styles, events and unsupported attributes are not permitted.');
        if (key === 'encoding' && (name !== 'annotation' || !['application/x-tex', 'text/plain'].includes(value))) throw new Error('Only plain text MathML annotations are supported.');
        if (key === 'display' && (name !== 'math' || !['inline', 'block'].includes(value))) throw new Error('MathML display must be inline or block.');
        if (key === 'display') display = value === 'block';
        checkAttributeBounds(key, value);
        attrs += ` ${key}="${escapeXML(value)}"`;
      }
      output += `<${name}${name === 'math' ? ' xmlns="http://www.w3.org/1998/Math/MathML"' : ''}${attrs}${selfClosing ? '/>' : '>'}`;
      if (!selfClosing) stack.push(name); else if (!stack.length) rootClosed = true;
    }
    index = end + 1;
  }
  if (stack.length || !rootClosed) throw new Error('MathML contains an incomplete expression.');
  return { source: output, display, plainText: plainText.replace(/\s+/g, ' ').trim() };
}
