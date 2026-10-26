import { parseMinimal } from '@unified-latex/unified-latex-util-parse';
import { latexToStudyText } from './cbt-import';

export type CbtSolution = { sourceNumber: string; key?: string; explanation: string };
type Node = ReturnType<typeof parseMinimal>['content'][number];
const at = (node: Node) => node.position?.start.offset ?? 0;
const end = (node: Node) => node.position?.end.offset ?? at(node);
const stop = /^(?:self[ -]*analysis|revision\s+rules?|your\s+revision|marking\s+scheme|confidence\s+tracker)\b/im;

/** Reads only explicitly labelled supplied solutions. It never creates an answer. */
export function parseCbtSolutions(input: string, format: 'text' | 'latex' = 'text'): CbtSolution[] {
  input = input.replace(/\r\n?/g, '\n');
  // Some generated .tex files contain a literal TAB where a producer escaped
  // the leading \t in \textbf. Recover only explicit Answer/Ans/Key headers.
  if (format === 'latex') input = input.replace(/\textbf\{(?=(?:Answer|Ans\.?|Key)\b)/gi, '\\textbf{');
  const result: CbtSolution[] = [];
  const add = (number: string, body: string) => {
    const text = (format === 'latex' ? latexToStudyText(body) : body).trim();
    // A full answer token must precede a line break, difficulty suffix or an
    // explanation delimiter. Prose after a label is never guessed as a key.
    const headline = /^(?:\*\*)?(?:correct\s+)?(?:answer|ans\.?|key)\s*[:=]?\s*((?:\(?[A-T]\)?(?:\s*[,/&+]\s*\(?[A-T]\)?)*|[A-T]{1,20}|[+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*\|\s*(?:[EMHL]|Easy|Medium|Moderate|Hard|Tough))?)(?:\*\*)?(?:\s*\n|\s*(?:[.;]|[–—]|Explanation\s*:|Solution\s*:)|$)/i.exec(text);
    const labelled = /^(?:\*\*)?(?:explanation|solution)\s*[:=](?:\*\*)?\s*/i.exec(text);
    if (!headline && !labelled) return;
    const explanation = text.slice((headline || labelled)![0].length).replace(/^\s*(?:Explanation|Solution)\s*:\s*/i, '').split(stop)[0].trim();
    if (explanation.length > 50000) return;
    result.push({ sourceNumber: number, ...(headline ? { key: headline[1].replace(/\s*\|.*$/, '').trim() } : {}), explanation });
  };
  if (format === 'latex') {
    const tree = parseMinimal(input);
    let visits = 0;
    const walk = (nodes: Node[], depth = 0, listDepth = 0) => {
      if (depth > 100 || (visits += nodes.length) > 250000) throw new Error('The solution source is too complex. Split it into smaller sections.');
      for (const node of nodes) {
        if ((node.type === 'environment' || node.type === 'mathenv') && node.env === 'questionblock') {
          const first = node.content.find(item => !['whitespace', 'parbreak', 'comment'].includes(item.type));
          if (first?.type === 'group') {
            const number = input.slice(at(first) + 1, end(first) - 1).trim();
            if (/^\d+(?:[a-z]|\([a-z]\))?$/i.test(number)) add(number, input.slice(end(first), input.lastIndexOf('\\end', end(node))));
          }
          continue;
        }
        const isList = (node.type === 'environment' || node.type === 'mathenv') && /^(?:enumerate|itemize)$/.test(node.env);
        if ((node.type === 'environment' || node.type === 'mathenv') && node.env === 'enumerate' && listDepth === 0) {
          const items = node.content.filter(item => item.type === 'macro' && item.content === 'item');
          const prefix = input.slice(at(node), items.length ? at(items[0]) : end(node));
          if (/\blabel\s*=\s*[^\n]*\\(?:alph|Alph|roman|Roman)\b/.test(prefix)) continue;
          let number = Number(/\bstart\s*=\s*(\d+)/.exec(prefix)?.[1] || 1) - 1;
          const counters = node.content.filter(item=>item.type==='macro'&&item.content==='setcounter');
          let previous = at(node);
          for (let i = 0; i < items.length; i++) {
            for(const counter of counters.filter(counter=>at(counter)>=previous&&at(counter)<at(items[i]))){
              const assignment=/^\\setcounter\s*\{enumi\}\s*\{(\d+)\}/.exec(input.slice(at(counter)));
              if(assignment)number=Number(assignment[1]);
            }
            let body = input.slice(end(items[i]), i + 1 < items.length ? at(items[i + 1]) : input.lastIndexOf('\\end', end(node)));
            const label = /^\s*\[\(?([\d]+)\)?[.)]?\]/.exec(body);
            if(/^\s*\[/.test(body)&&!label){previous=end(items[i]);continue;}
            if (label) { number = Number(label[1]); body = body.slice(label[0].length); } else number++;
            add(String(number), body);
            previous=end(items[i]);
          }
        }
        if ('content' in node && Array.isArray(node.content)) walk(node.content as Node[], depth + 1, listDepth + (isList ? 1 : 0));
      }
    };
    walk(tree.content);
    // Explicit numbered prose outside list environments is also supported.
  }
  const plain = format === 'latex' ? latexToStudyText(input) : input;
  const lines = plain.replace(/\r\n?/g, '\n').replace(/^\s*\[Page\s+\d+\]\s*$/gim, '').split('\n');
  const explicitHeader = (line: string) => /^\s*(?:Q(?:uestion)?\.?\s*)?\d+(?:[a-z]|\([a-z]\))?\s*(?:[.):–—-]\s*|\s+)(?:\*\*)?(?:Ans(?:wer)?\.?|Key|Explanation|Solution)\b/i.test(line);
  for (let i = 0; i < lines.length; i++) {
    const header = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d+(?:[a-z]|\([a-z]\))?)\s*(?:[.):–—-]\s*|\s+)(?=(?:\*\*)?(?:Ans(?:wer)?\.?|Key|Explanation|Solution)\b)(.*)$/i.exec(lines[i]);
    const numberOnly = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d+)\s*[.):]\s*$/.exec(lines[i]);
    if (!header && !(numberOnly && /^\s*(?:\*\*)?(?:Ans(?:wer)?\.?|Key|Explanation|Solution)\b/i.test(lines[i+1] || ''))) continue;
    let j = i + 1;
    while (j < lines.length && !explicitHeader(lines[j]) && !(/^\s*(?:Q(?:uestion)?\.?\s*)?\d+\s*[.):]\s*$/.test(lines[j]) && /^\s*(?:\*\*)?(?:Ans(?:wer)?\.?|Key|Explanation|Solution)\b/i.test(lines[j+1]||'')) && !/^\s*\d+[.)]\s*[_–—-]{3,}/.test(lines[j]) && !stop.test(lines[j])) j++;
    add((header || numberOnly)![1], [header?.[2] || '', ...lines.slice(i+1,j)].join('\n'));
    i = j - 1;
  }
  return result.slice(0, 1000);
}
