import { parseMinimal } from '@unified-latex/unified-latex-util-parse';
import { latexToStudyText } from './cbt-import';
import { protectCbtMathML } from './cbt-mathml';
import { normalizeScientificMarkdown } from './scientific-notation';

type Node = ReturnType<typeof parseMinimal>['content'][number];
type ListStyle = 'bullet' | 'number' | 'upper' | 'lower';
const inlineFormat: Record<string, string> = { textbf: '**', textit: '*', emph: '*', textsc: '', textnormal: '', textrm: '', textsf: '', mbox: '' };
const headings: Record<string, string> = { title: '#', part: '#', chapter: '#', section: '##', subsection: '###', subsubsection: '####' };
const spacing = new Set(['noindent', 'smallskip', 'medskip', 'bigskip', 'clearpage', 'newpage', 'pagebreak', 'centering', 'raggedright', 'bfseries', 'itshape', 'sffamily', 'large', 'Large', 'LARGE', 'small', 'footnotesize']);
const layout = new Set(['document', 'center', 'flushleft', 'flushright', 'questions', 'parts', 'quote']);
const lists = new Set(['enumerate', 'itemize', 'description', 'choices', 'checkboxes', 'oneparchoices', 'oneparcheckboxes']);
function letterStyle(settings: string): ListStyle | undefined {
  const label = /\blabel\s*=.*?\\(Alph|alph)\b/.exec(settings)?.[1];
  return label === 'Alph' ? 'upper' : label === 'alph' ? 'lower' : undefined;
}

/** Produce reader text and math without expanding macros or resolving external files. */
export function latexResourceToMarkdown(input: string): string {
  const mathml = protectCbtMathML(input, { latexComments: true }), source = mathml.source;
  const raw = (node: Node) => source.slice(node.position?.start.offset, node.position?.end.offset);
  const isSpace = (node: Node) => node.type === 'whitespace' || node.type === 'comment';
  const parsed = parseMinimal(source).content;
  const document = parsed.find(node => node.type === 'environment' && node.env === 'document');
  const preamble = document ? source.slice(0, document.position?.start.offset) : '';
  const enumerateStyle = letterStyle(/\\setlist\[enumerate[^\]\n]*\]\s*\{[^\n]*/.exec(preamble)?.[0] || '') || 'number';
  let nodesSeen = 0;

  function render(nodes: Node[], depth: number, list?: ListStyle): string {
    if (depth > 100 || (nodesSeen += nodes.length) > 250_000) throw new Error('This LaTeX document is too complex for the reader. Split it into smaller documents.');
    const output: string[] = [];
    let item = 0;
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      const skipStar = () => {
        const next = nodes[index + 1];
        if (next?.type === 'string' && next.content === '*') index++;
      };
      const group = () => {
        let next = index + 1;
        while (nodes[next] && isSpace(nodes[next])) next++;
        const argument = nodes[next];
        if (argument?.type !== 'group') return '';
        index = next;
        return render(argument.content, depth + 1).trim();
      };
      if (node.type === 'comment') continue;
      if (node.type === 'environment' && typeof node.env === 'string') {
        const name = node.env;
        const content = node.content;
        if (name === 'questionblock' || name === 'minipage' || /^multicols\*?$/.test(name)) {
          const first = content.findIndex(child => !isSpace(child));
          const argument = content[first];
          const body = argument?.type === 'group' ? content.slice(first + 1) : content;
          const number = argument?.type === 'group' && name === 'questionblock' ? render(argument.content, depth + 1).trim() : '';
          output.push('\n\n' + (number ? `### Question ${number}\n\n` : '') + render(body, depth + 1).trim() + '\n\n');
        } else if (lists.has(name)) {
          const settings = /^\s*\[[^\]\n]*\]/.exec(content.map(raw).join(''))?.[0];
          const offset = settings ? (content[0]?.position?.start.offset ?? 0) + settings.length : 0;
          const style = name === 'enumerate' ? letterStyle(settings || '') || enumerateStyle : /choices|checkboxes/.test(name) ? 'upper' : 'bullet';
          output.push('\n\n' + render(content.filter(child => (child.position?.end.offset ?? 0) > offset), depth + 1, style).trim() + '\n\n');
        } else if (layout.has(name)) {
          output.push('\n\n' + render(content, depth + 1).trim() + '\n\n');
        } else {
          output.push(raw(node).replace(/^(\\begin\{(?:tabular|longtable)\}\s*\{)([lcr|\s]*(?:[pmb]\{\d+(?:\.\d+)?(?:cm|mm|in|pt|em)\}[lcr|\s]*)+)(\})/, (_, prefix: string, columns: string, suffix: string) => prefix + columns.replace(/[pmb]\{[^}]*\}/g, 'l') + suffix));
        }
      } else if (node.type === 'macro') {
        const name = node.content;
        if (Object.hasOwn(inlineFormat, name)) {
          const wrap = inlineFormat[name], value = group();
          output.push(value ? wrap + value + wrap : '');
        } else if (Object.hasOwn(headings, name) || name === 'papertitle') {
          skipStar();
          const title = group(), subtitle = name === 'papertitle' ? group() : '';
          if (title) output.push(`\n\n${headings[name] || '#'} ${title}\n\n`);
          if (subtitle) output.push(`${subtitle}\n\n`);
        } else if (list && /^(?:item|choice|CorrectChoice)$/.test(name)) {
          skipStar();
          item++;
          const letter = item <= 26 && (list === 'upper' || list === 'lower') ? String.fromCharCode((list === 'upper' ? 64 : 96) + item) : '';
          const marker = list === 'bullet' ? '-' : letter ? `- **(${letter})**` : `${item}.`;
          output.push(`\n\n${marker} `);
          while (nodes[index + 1] && isSpace(nodes[index + 1])) index++;
        } else if (['rule', 'vspace', 'hspace', 'input', 'include'].includes(name)) {
          skipStar(); group(); if (name === 'rule') group();
        } else if (name === 'hfill') output.push(' · ');
        else if (name === 'quad' || name === 'qquad') output.push(' ');
        else if (name === 'hrule') output.push('\n\n---\n\n');
        else if (!spacing.has(name)) output.push(raw(node));
      } else if (node.type === 'mathenv') {
        output.push(normalizeScientificMarkdown(raw(node)));
      } else if (node.type === 'group') {
        output.push('{' + render(node.content, depth + 1) + '}');
      } else {
        if (node.type === 'inlinemath' && nodes[index - 1]?.type === 'inlinemath') output.push(' ');
        output.push(raw(node));
      }
    }
    return output.join('');
  }

  const body = document && document.type === 'environment' ? document.content : parsed;
  const trailing = document ? source.slice(document.position?.end.offset).trim() : '';
  const formatted = latexToStudyText(render(body, 0));
  return mathml.restore([formatted, trailing].filter(Boolean).join('\n\n'));
}
