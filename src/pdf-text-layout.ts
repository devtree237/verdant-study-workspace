import { toUnicodeScript } from './scientific-notation';

export type PdfTextLayout = 'auto' | 'single' | 'two-column';
export type PdfTextFragment = { text: string; x: number; y: number; width: number; height: number };
type Fragment = PdfTextFragment & { script?: true };
type Row = { y: number; height: number; fragments: Fragment[] };

function rowsFromFragments(items: PdfTextFragment[]): { rows: Row[]; scripts: number } {
  const rows: Row[] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (!item.text.trim() || ![item.x, item.y, item.width, item.height].every(Number.isFinite) || item.width < 0 || item.height <= 0) continue;
    // Baseline grouping must be narrower than a real sub/superscript shift.
    const row = rows.slice(-6).find(candidate => Math.abs(candidate.y - item.y) <= Math.max(1, Math.min(candidate.height, item.height) * .18));
    if (row) {
      row.fragments.push({ ...item });
      if (item.height > row.height) row.y = item.y;
      row.height = Math.max(row.height, item.height);
    } else rows.push({ y: item.y, height: item.height, fragments: [{ ...item }] });
  }
  rows.sort((a, b) => a.y - b.y);
  rows.forEach(row => row.fragments.sort((a, b) => a.x - b.x));
  const moved = new Set<Fragment>();
  const additions = new Map<Row, Fragment[]>();
  let scripts = 0;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for (let start = 0; start < row.fragments.length; start++) {
      const first = row.fragments[start];
      const cluster = [first];
      while (start + 1 < row.fragments.length) {
        const previous = cluster.at(-1)!, next = row.fragments[start + 1];
        if (Math.abs(next.height - first.height) > first.height * .15 || next.x - previous.x - previous.width > Math.max(1.5, first.height * .22)) break;
        cluster.push(next); start++;
      }
      const text = cluster.map(fragment => fragment.text).join('').trim();
      const right = Math.max(...cluster.map(fragment => fragment.x + fragment.width));
      const candidates = rows.slice(Math.max(0, rowIndex - 4), rowIndex + 5).flatMap(parent => {
        const shift = first.y - parent.y;
        if (parent === row || first.height > parent.height * .85 || first.height < parent.height * .45 || Math.abs(shift) < Math.max(1.4, parent.height * .16) || Math.abs(shift) > parent.height * .62) return [];
        const unicode = toUnicodeScript(text, shift < 0 ? 'sup' : 'sub');
        if (!unicode) return [];
        // Stacked fractions/overlapping rows are not evidence of a script.
        if (parent.fragments.some(fragment => Math.min(fragment.x + fragment.width, right) - Math.max(fragment.x, first.x) > .8)) return [];
        const gaps = parent.fragments.filter(fragment => fragment.height >= parent.height * .85).flatMap(fragment => {
          const before = first.x - fragment.x - fragment.width, after = fragment.x - right;
          return [before, after].filter(gap => gap >= -.5 && gap <= Math.max(3, parent.height * .55));
        });
        if (!gaps.length) return [];
        return [{ parent, unicode, score: Math.min(...gaps) + Math.abs(shift) * .2 }];
      }).sort((a, b) => a.score - b.score);
      // Equally plausible baselines remain plain source for manual review.
      if (!candidates.length || candidates[1] && Math.abs(candidates[1].score - candidates[0].score) < .5) continue;
      const selected = candidates[0];
      const addition: Fragment = { ...first, text: selected.unicode, width: right - first.x, script: true };
      additions.set(selected.parent, [...(additions.get(selected.parent) || []), addition]);
      cluster.forEach(fragment => moved.add(fragment)); scripts++;
    }
  }
  return { scripts, rows: rows.map(row => ({ ...row, fragments: [...row.fragments.filter(fragment => !moved.has(fragment)), ...(additions.get(row) || [])].sort((a, b) => a.x - b.x) })).filter(row => row.fragments.length) };
}

function lineText(fragments: Fragment[]): string {
  let result = '', previous: Fragment | undefined;
  for (const fragment of fragments) {
    const gap = previous ? fragment.x - previous.x - previous.width : 0;
    const joinedScript = previous && (previous.script || fragment.script) && gap <= Math.max(1.5, Math.min(previous.height, fragment.height) * .25);
    const separator = !previous || joinedScript ? '' : gap > Math.max(15, fragment.height * 1.5) ? '    ' : gap > Math.min(previous.height, fragment.height) * .12 ? ' ' : '';
    result += separator + fragment.text; previous = fragment;
  }
  return result.replace(/[ \t]+/g, match => match.length >= 3 ? '    ' : ' ').trim();
}
function gapAt(row: Row, split: number): number {
  const left = row.fragments.filter(item => item.x + item.width <= split), right = row.fragments.filter(item => item.x >= split);
  if (!left.length || !right.length || row.fragments.some(item => item.x < split && item.x + item.width > split)) return 0;
  return right[0].x - Math.max(...left.map(item => item.x + item.width));
}

/** Uses only selectable PDF glyphs and geometry. It does not infer equations,
 * answer keys, OCR text or a fraction from stacked, ambiguous fragments. */
export function pdfPageText(items: PdfTextFragment[], width: number, layout: PdfTextLayout = 'auto'): { text: string; warnings: string[]; columns: 1 | 2 } {
  if (!Number.isFinite(width) || width <= 0) throw new Error('The PDF page has invalid dimensions.');
  const { rows, scripts } = rowsFromFragments(items), warnings: string[] = [];
  if (scripts) warnings.push('Raised and lowered PDF characters were preserved where their size and position clearly indicated a script. Verify scientific notation against the original.');
  const lines = rows.map(row => lineText(row.fragments));
  if (layout === 'single' || layout === 'auto' && rows.length < 3) return { text: lines.join('\n'), warnings, columns: 1 };
  const structuredTable = lines.some(line => (line.match(/\b(?:Q(?:uestion)?\s*(?:No\.?|Number)?\s*(?:Key|Ans(?:wer)?s?)|Q\s*Key\s*Level)\b/gi) || []).length >= 2 || /\bColumn\s*(?:I|1|A)\b.*\bColumn\s*(?:II|2|B)\b/i.test(line));
  if (layout === 'auto' && structuredTable) return { text: lines.join('\n'), warnings, columns: 1 };
  const candidates = [.36, .4, .44, .48, .5, .52, .56, .6, .64].map(ratio => {
    const split = width * ratio, separated = rows.filter(row => gapAt(row, split) >= Math.max(24, width * .035));
    return { split, count: separated.length, score: separated.reduce((sum, row) => sum + Math.min(gapAt(row, split), width * .14), 0) };
  }).sort((a, b) => b.count - a.count || b.score - a.score || Math.abs(a.split - width / 2) - Math.abs(b.split - width / 2));
  const best = candidates[0], confident = best.count >= Math.max(3, Math.ceil(rows.length * .42));
  if (layout === 'auto' && !confident) {
    if (best.count >= 3) warnings.push('Some wide PDF gaps were found, but a consistent column gutter was not clear. Check the extracted order or choose Two columns.');
    return { text: lines.join('\n'), warnings, columns: 1 };
  }
  const split = confident ? best.split : width / 2;
  warnings.push(layout === 'auto' ? 'A two-column PDF layout was detected. Check the extracted reading order before parsing.' : 'Two-column reading order is selected. Check headings, tables and equations against the original PDF.');
  const output: string[] = [], left: Fragment[][] = [], right: Fragment[][] = [];
  const flush = () => { output.push(...left.map(lineText), ...right.map(lineText)); left.length = 0; right.length = 0; };
  for (const row of rows) {
    const crosses = row.fragments.some(item => item.x < split && item.x + item.width > split);
    const both = row.fragments.some(item => item.x < split) && row.fragments.some(item => item.x >= split);
    if (crosses || both && gapAt(row, split) < Math.max(20, width * .03)) { flush(); output.push(lineText(row.fragments)); continue; }
    const a = row.fragments.filter(item => item.x < split), b = row.fragments.filter(item => item.x >= split);
    if (a.length) left.push(a); if (b.length) right.push(b);
  }
  flush(); return { text: output.filter(Boolean).join('\n'), warnings, columns: 2 };
}
