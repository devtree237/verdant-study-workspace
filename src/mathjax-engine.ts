import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { MathML } from '@mathjax/src/js/input/mathml.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { SerializedMmlVisitor } from '@mathjax/src/js/core/MmlTree/SerializedMmlVisitor.js';
import { STATE } from '@mathjax/src/js/core/MathItem.js';
import type { MathItem } from '@mathjax/src/js/core/MathItem.js';
import type { MmlNode, AbstractMmlTokenNode } from '@mathjax/src/js/core/MmlTree/MmlNode.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js';
import { MathJaxNewcmFont } from '@mathjax/mathjax-newcm-font/js/svg.js';
import { MathJaxMhchemFontExtension } from '@mathjax/mathjax-mhchem-font-extension/js/svg.js';
import './mathjax-font-ranges';
import { sanitizeMathML } from './mathml';

export type MathFormat = 'tex' | 'mathml';
export type MathRenderResult = { html: string; mathml: string; display: boolean; label: string };
const adaptor = liteAdaptor({ fontSize: 16 });
RegisterHTMLHandler(adaptor);
class BundledNewcmFont extends MathJaxNewcmFont {
  constructor() {
    super();
    // All setup functions come from the static imports above. No asyncLoad or CDN.
    for (const range of Object.values(BundledNewcmFont.dynamicFiles)) range.setup(this);
  }
}
const font = new BundledNewcmFont();
font.addExtension(MathJaxMhchemFontExtension);
const visitor = new SerializedMmlVisitor();
const cache = new Map<string, MathRenderResult>();
let cacheBytes = 0;
const MAX_CACHE_BYTES = 3_000_000, MAX_CACHE_ITEMS = 160;
const chemistryCharacters: Record<number, string> = { 0xe408: '⇌', 0xe409: '⇌', 0xe40a: '⇋', 0xe410: 'dashed bond', 0xe411: 'bond with one dashed line', 0xe412: 'bond with two dashed lines', 0xe413: 'bond with an inner dashed line', 0xe428: '←', 0xe429: '→', 0xe42a: '↔', 0xe42b: '⇄', 0xe42c: '←', 0xe42d: '→', 0xe42e: '↔' };
function accessibleChemistry(source: string): string {
  return source.replace(/&#x([0-9a-f]+);|&#([0-9]+);|[\uE400-\uE42F]/gi, (match, hex: string | undefined, decimal: string | undefined) => chemistryCharacters[hex ? Number.parseInt(hex, 16) : decimal ? Number(decimal) : match.codePointAt(0)!] ?? match);
}
function describeMath(node: MmlNode): string {
  if (node.kind === 'mphantom' || node.kind === 'annotation' || node.kind === 'annotation-xml') return '';
  if (node.kind === 'semantics') return node.childNodes[0] ? describeMath(node.childNodes[0]) : '';
  if (node.isToken) {
    const text = accessibleChemistry((node as AbstractMmlTokenNode).getText());
    return ({ '→': 'yields', '←': 'left arrow', '↔': 'reversible reaction', '⇌': 'equilibrium', '⇋': 'equilibrium', '⇄': 'reversible reaction', '=': 'equals', '+': 'plus', '−': 'minus', '×': 'times', '⋅': 'dot', '∞': 'infinity', '∑': 'sum', '∫': 'integral' } as Record<string, string>)[text] ?? text;
  }
  const children = node.childNodes?.map(describeMath) ?? [];
  switch (node.kind) {
    case 'mfrac': return `fraction ${children[0]} over ${children[1]}, end fraction`;
    case 'msup': return `${children[0]} superscript ${children[1]}`;
    case 'msub': return `${children[0]} subscript ${children[1]}`;
    case 'msubsup': return `${children[0]} subscript ${children[1]} superscript ${children[2]}`;
    case 'msqrt': return `square root of ${children.join(' ')}, end root`;
    case 'mroot': return `${children[1]} root of ${children[0]}, end root`;
    case 'mover': return `${children[0]} with ${children[1]} above`;
    case 'munder': return `${children[0]} with ${children[1]} below`;
    case 'munderover': return `${children[0]} from ${children[1]} to ${children[2]}`;
    case 'mtable': return `table ${children.join('; ')}, end table`;
    case 'mtr': case 'mlabeledtr': return `row ${children.join(', ')}`;
    default: return children.join(' ');
  }
}

/** Converts one isolated formula in LiteDOM, never the React-owned document. */
export function renderMathFormula(source: string, format: MathFormat = 'tex', display = false): MathRenderResult {
  if (!source.trim()) throw new Error('This expression is empty.');
  if (source.length > 32_000) throw new Error('This expression is too large to display safely.');
  const safe = format === 'mathml' ? sanitizeMathML(source) : null;
  const hasDisplay = safe && /^<math\b[^>]*\bdisplay=/.test(safe.source);
  const block = safe ? hasDisplay ? safe.display : display : display;
  const expression = safe ? hasDisplay ? safe.source : safe.source.replace(/^<math\b/, `<math display="${block ? 'block' : 'inline'}"`) : source;
  const key = JSON.stringify([format, block, expression]);
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
  const tex = new TeX({ packages: ['base', 'ams', 'newcommand', 'mhchem'], tags: 'none', maxMacros: 1000, maxBuffer: 32_000, formatError: (_jax: unknown, error: Error) => { throw error; } });
  const output = new SVG({ fontData: font, fontCache: 'none', displayOverflow: 'overflow', linebreaks: { inline: false } });
  let mathml = '', label = '';
  const document = mathjax.document('', {
    InputJax: [tex, new MathML()], OutputJax: output,
    compileError: (_doc: unknown, _math: unknown, error: Error) => { throw error; },
    typesetError: (_doc: unknown, _math: unknown, error: Error) => { throw error; },
    renderActions: { accessibleMath: [STATE.CONVERT + 1, () => {}, (math: MathItem<unknown, unknown, unknown>) => {
      math.root.walkTree(node => { node.attributes?.unset('data-latex'); node.attributes?.unset('data-latex-item'); });
      label = describeMath(math.root).replace(/\s+/g, ' ').trim().slice(0, 4096);
      const escapedLabel = label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      mathml = accessibleChemistry(visitor.visitTree(math.root)).replace(/^<math(?=[\s>])/, `<math aria-label="${escapedLabel}"`);
    }] },
  });
  const node = document.convert(expression, { format: format === 'tex' ? 'TeX' : 'MathML', display: block, em: 16, ex: 8, containerWidth: 100_000 });
  // Inline dimensions win over generic icon/image rules in answer buttons.
  const svg = adaptor.tags(node, 'svg')[0];
  if (!svg || !mathml || /<merror\b/.test(mathml)) throw new Error('This expression could not be rendered. Review the original notation.');
  for (const dimension of ['width', 'height']) {
    const value = adaptor.getAttribute(svg, dimension);
    const number = Number.parseFloat(value);
    if (!Number.isFinite(number) || number < 0 || number > 5000) throw new Error('This expression exceeds the safe display size.');
    adaptor.setStyle(svg, dimension, value);
  }
  adaptor.setAttribute(svg, 'aria-hidden', 'true');
  adaptor.setAttribute(svg, 'focusable', 'false');
  const result = { html: adaptor.outerHTML(node), mathml, display: block, label };
  const bytes = result.html.length + result.mathml.length;
  if (bytes > 2_000_000) throw new Error('This expression is too complex to display safely.');
  if (bytes <= MAX_CACHE_BYTES) {
    cache.set(key, result); cacheBytes += bytes;
    while (cacheBytes > MAX_CACHE_BYTES || cache.size > MAX_CACHE_ITEMS) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      const value = cache.get(oldest)!; cacheBytes -= value.html.length + value.mathml.length; cache.delete(oldest);
    }
  }
  return result;
}
