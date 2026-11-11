import { PDFDocument, PDFHexString, PDFName, PDFOperator, PDFOperatorNames, StandardFonts, beginMarkedContent, endMarkedContent, rgb } from 'pdf-lib';
import type { PDFArray, PDFPage, PDFFont, PDFRef, RGB } from 'pdf-lib';
import { formatResultTime, getTimeJourney, getTimeQuality } from './result-metrics';
import { getAttemptQuestions } from './testing-model';
import type { AnalysisGroup, QuestionResult, TestAnalysis, TestAttempt } from './testing-model';

const pageWidth = 595, pageHeight = 842, margin = 40, contentWidth = pageWidth - margin * 2;
const ink = rgb(.06, .12, .21), muted = rgb(.30, .36, .46), blue = rgb(.14, .25, .65);
const green = rgb(.07, .39, .26), red = rgb(.65, .22, .19), line = rgb(.83, .87, .92);
const tint = rgb(.94, .96, .99), white = rgb(1, 1, 1);
const textSize = 9.5, rowLineHeight = 14, cellPadding = 8, tableHeaderHeight = 24;
const bottom = pageHeight - 57;
const formatNumber = new Intl.NumberFormat('en', {maximumFractionDigits: 2});
const number = (value: number) => formatNumber.format(value);
const percentage = (value: number) => `${number(value)}%`;
const score = (value: number, max: number) => `${number(value)} / ${number(max)}`;
const marks = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`;
const outcomes: Record<QuestionResult, {text: string; color: RGB}> = {
  correct: {text: 'Correct', color: green},
  incorrect: {text: 'Incorrect', color: red},
  unattempted: {text: 'Unanswered', color: muted},
  unvisited: {text: 'Unvisited', color: muted},
};
const colorCss = (color: RGB) => `rgb(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)})`;
const canvasFont = (font: PDFFont, size: number) => `${font.name === StandardFonts.HelveticaBold ? 'bold ' : ''}${size}px Inter, "Nirmala UI", "Noto Sans", sans-serif`;

type Cell = string | {text: string; color?: RGB};
type TagParent = {reference: PDFRef; children: PDFArray};
type TagRole = 'Document' | 'H1' | 'H2' | 'P' | 'Table' | 'TR' | 'TH' | 'TD';
type Tag = TagParent & {role: TagRole};
type TextItem = {page: PDFPage; value: string; x: number; top: number; font: PDFFont; size: number; color: RGB; tag?: Tag};

function groupRow(group: AnalysisGroup): Cell[] {
  return [group.name, score(group.score, group.maxScore), number(group.correct), number(group.incorrect),
    number(group.unattempted), group.attempted ? percentage(group.accuracy) : '-', formatResultTime(group.timeSeconds)];
}

/** A standalone report drawn from the same saved scores and timing data shown in Results. */
export async function createResultPdf(attempt: TestAttempt, analysis: TestAnalysis): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());
  const canEncode = (value: string) => Array.from(value).every(character => supported.has(character.codePointAt(0)!));
  const fallback = (value: string) => Array.from(value.normalize('NFKD')).filter(character => !/\p{Mark}/u.test(character))
    .map(character => canEncode(character) ? character : '?').join('');
  let canvas: HTMLCanvasElement | undefined;
  const canvasContext = () => {
    if (typeof document === 'undefined') return null;
    canvas ??= document.createElement('canvas');
    return canvas.getContext('2d');
  };
  const items: TextItem[] = [];
  let page: PDFPage;
  let y = 0;

  // Give PDF readers the same heading and table order as the printed report.
  const objects = pdf.context;
  const rootChildren = objects.obj([]);
  const parentNumbers = objects.obj([]);
  const parentTree = objects.register(objects.obj({Nums: parentNumbers}));
  const structure = objects.obj({Type: 'StructTreeRoot', K: rootChildren, ParentTree: parentTree});
  const structureRoot = {reference: objects.register(structure), children: rootChildren};
  const pageParents = new Map<PDFPage, PDFArray>();
  const documentTag = addTag('Document', structureRoot);
  pdf.catalog.set(PDFName.of('StructTreeRoot'), structureRoot.reference);
  pdf.catalog.set(PDFName.of('MarkInfo'), objects.obj({Marked: true}));
  pdf.setTitle(`${attempt.paper.title} - Result analysis`, {showInWindowTitleBar: true});
  pdf.setSubject('Score, subject performance, difficulty, timing and question outcomes');
  pdf.setCreator('Verdant Study Workspace');
  pdf.setLanguage('en');

  function addTag(role: TagRole, parent: TagParent, scope?: 'Row' | 'Column'): Tag {
    const children = objects.obj([]);
    const element = objects.obj({
      Type: 'StructElem', S: role, P: parent.reference, K: children,
      ...(scope && {A: {O: 'Table', Scope: scope}}),
    });
    const reference = objects.register(element);
    parent.children.push(reference);
    return {reference, children, role};
  }

  function width(value: string, font: PDFFont, size: number) {
    if (canEncode(value)) return font.widthOfTextAtSize(value, size);
    const context = canvasContext();
    if (!context) return font.widthOfTextAtSize(fallback(value), size);
    context.font = canvasFont(font, size);
    return context.measureText(value).width;
  }

  function wrap(value: string, maxWidth: number, font: PDFFont, size: number) {
    const result: string[] = [];
    let current = '';
    for (const word of value.trim().split(/\s+/u)) {
      if (width(current ? `${current} ${word}` : word, font, size) <= maxWidth) {
        current = current ? `${current} ${word}` : word;
        continue;
      }
      if (current) result.push(current);
      current = '';
      for (const character of word) {
        if (current && width(current + character, font, size) > maxWidth) {
          result.push(current);
          current = '';
        }
        current += character;
      }
    }
    return current ? [...result, current] : result;
  }

  function text(value: string, x: number, top: number, font = regular, size = textSize, color = ink, tag?: Tag) {
    items.push({page, value, x, top, font, size, color, tag});
  }

  function rectangle(x: number, top: number, width: number, height: number, color: RGB) {
    page.pushOperators(beginMarkedContent('Artifact'));
    page.drawRectangle({x, y: pageHeight - top - height, width, height, color});
    page.pushOperators(endMarkedContent());
  }

  function rule(top: number) {
    rectangle(margin, top, contentWidth, .6, line);
  }

  function newPage() {
    page = pdf.addPage([pageWidth, pageHeight]);
    const pageIndex = pageParents.size;
    const parents = objects.obj([]);
    pageParents.set(page, parents);
    page.node.set(PDFName.of('StructParents'), objects.obj(pageIndex));
    parentNumbers.push(objects.obj(pageIndex));
    parentNumbers.push(parents);
    rectangle(0, 0, pageWidth, 5, blue);
    text('Verdant', margin, 25, bold, 12, blue);
    const label = 'RESULT ANALYSIS';
    text(label, pageWidth - margin - width(label, bold, 8), 29, bold, 8, muted);
    rule(48);
    y = 68;
  }

  function table(title: string, headings: string[], widths: number[], rows: Cell[][], description = '') {
    const descriptionLines = description ? wrap(description, contentWidth, regular, textSize) : [];
    const headingTag = addTag('H2', documentTag);
    const descriptionTag = descriptionLines.length ? addTag('P', documentTag) : undefined;
    const tableTag = addTag('Table', documentTag);
    const headerTag = addTag('TR', tableTag);
    const begin = (continued = false) => {
      text(continued ? `${title} (continued)` : title, margin, y, bold, 14, ink, continued ? undefined : headingTag);
      y += 23;
      if (!continued && descriptionLines.length) {
        descriptionLines.forEach(value => {
          text(value, margin, y, regular, textSize, muted, descriptionTag);
          y += rowLineHeight;
        });
        y += 5;
      }
      rectangle(margin, y, contentWidth, tableHeaderHeight, tint);
      let x = margin;
      headings.forEach((heading, index) => {
        const tag = continued ? undefined : addTag('TH', headerTag, 'Column');
        text(heading, x + cellPadding, y + 7, bold, 8.5, muted, tag);
        x += widths[index];
      });
      y += tableHeaderHeight;
      rule(y);
    };
    const prepared = rows.map(row => row.map((cell, index) => {
      const font = index === 0 ? bold : regular;
      const {text: value, color = ink} = typeof cell === 'string' ? {text: cell} : cell;
      return {font, color, lines: wrap(value, widths[index] - cellPadding * 2, font, textSize)};
    }));
    const heights = prepared.map(row => Math.max(...row.map(cell => cell.lines.length), 1) * rowLineHeight + 8);
    const introHeight = 23 + (descriptionLines.length ? descriptionLines.length * rowLineHeight + 5 : 0);
    if (y + introHeight + tableHeaderHeight + (heights[0] ?? 24) > bottom) newPage();
    begin();
    prepared.forEach((row, rowIndex) => {
      const height = heights[rowIndex];
      if (y + height > bottom) {
        newPage();
        begin(true);
      }
      let x = margin;
      const rowTag = addTag('TR', tableTag);
      row.forEach((cell, index) => {
        const tag = index === 0 ? addTag('TH', rowTag, 'Row') : addTag('TD', rowTag);
        cell.lines.forEach((value, lineIndex) => text(value, x + cellPadding, y + 5 + lineIndex * rowLineHeight, cell.font, textSize, cell.color, tag));
        x += widths[index];
      });
      y += height;
      rule(y);
    });
    y += 22;
  }

  newPage();
  const titleLines = wrap(attempt.paper.title, contentWidth - 36, bold, 23);
  const submitted = new Date(attempt.submittedAt ?? attempt.deadlineAt);
  const submittedLabel = Number.isFinite(submitted.getTime())
    ? `Submitted ${submitted.toLocaleString('en-IN', {dateStyle: 'medium', timeStyle: 'short'})}`
    : 'Result saved';
  const candidateLines = attempt.candidateName ? wrap(attempt.candidateName, contentWidth - 36, regular, 11) : [];
  const headerHeight = 100 + 29 * titleLines.length + 16 * candidateLines.length;
  rectangle(margin, y, contentWidth, headerHeight, tint);
  rectangle(margin, y, 3, headerHeight, blue);
  const headerX = margin + 18;
  let headerTop = y + 15;
  const titleTag = addTag('H1', documentTag);
  text(submittedLabel, headerX, headerTop, regular, 10, muted, addTag('P', documentTag));
  headerTop += 18;
  titleLines.forEach(value => {text(value, headerX, headerTop, bold, 23, ink, titleTag); headerTop += 29;});
  const candidateTag = candidateLines.length ? addTag('P', documentTag) : undefined;
  candidateLines.forEach(value => {text(value, headerX, headerTop, regular, 11, muted, candidateTag); headerTop += 16;});
  const scoreTag = addTag('P', documentTag);
  text(score(analysis.score, analysis.maxScore), headerX, headerTop + 8, bold, 31, blue, scoreTag);
  text(`Net score · ${number(analysis.negativeScore)} marks deducted`, headerX, headerTop + 47, regular, 10, muted, scoreTag);
  y += headerHeight + 16;

  const questionCount = analysis.questionRows.length;
  const metrics = [
    ['Questions answered', `${number(analysis.attempted)} / ${number(questionCount)}`],
    ['Accuracy', analysis.attempted ? percentage(analysis.accuracy) : 'No answers'],
    ['Time on questions', formatResultTime(analysis.timeSeconds)],
    ['Time allowed', formatResultTime(analysis.durationSeconds)],
  ];
  const metricWidth = contentWidth / metrics.length;
  metrics.forEach(([label, value], index) => {
    const x = margin + index * metricWidth;
    if (index) rectangle(x, y + 5, .6, 34, line);
    const metricTag = addTag('P', documentTag);
    text(label, x + 8, y + 3, regular, 9, muted, metricTag);
    text(value, x + 8, y + 19, bold, 14, ink, metricTag);
  });
  y += 62;

  const groupHeadings = ['Subject', 'Score', 'Correct', 'Incorrect', 'Unanswered', 'Accuracy', 'Time'];
  const groupWidths = [133, 78, 50, 57, 71, 61, 65];
  table('Subject breakdown', groupHeadings, groupWidths, analysis.subjects.map(groupRow));
  table('Difficulty breakdown', ['Difficulty', ...groupHeadings.slice(1)], groupWidths, analysis.difficulties.map(groupRow));

  const time = getTimeQuality(analysis.questionRows);
  table('Time by outcome', ['Outcome', 'Time recorded', 'Share of recorded time'], [200, 135, 180], [
    ['Correct', formatResultTime(time.correctSeconds), percentage(time.correctPercent)],
    ['Incorrect', formatResultTime(time.incorrectSeconds), percentage(time.incorrectPercent)],
    ['Unanswered', formatResultTime(time.unansweredSeconds), percentage(time.unansweredPercent)],
  ]);
  const journey = getTimeJourney(attempt, analysis.questionRows);
  if (journey.length) {
    const recorded = journey.reduce((total, bin) => total + bin.total, 0);
    table('Time journey', ['Time interval', 'Correct', 'Incorrect', 'Total recorded'], [185, 95, 95, 140],
      journey.map(bin => [bin.label.replace('–', '-'), number(bin.correct), number(bin.incorrect), number(bin.total)]),
      `${number(recorded)} of ${number(analysis.attempted)} final answers have saved timestamps.`);
  }

  const rowsById = new Map(analysis.questionRows.map(row => [row.question.id, row]));
  const questions = getAttemptQuestions(attempt).flatMap((question, index) => {
    const row = rowsById.get(question.id);
    if (!row) return [];
    const subjectAndTopic = [...new Set([question.subject, question.chapter, question.topic].filter(Boolean))].join(' / ');
    return [[`Q${index + 1}`, subjectAndTopic, question.difficulty, outcomes[row.status],
      `${formatResultTime(row.timeSeconds)} / ${formatResultTime(row.idealSeconds)}`,
      {text: marks(row.score), color: row.score < 0 ? red : row.score > 0 ? green : ink}]];
  });
  table('Question outcomes', ['No.', 'Subject / chapter / topic', 'Difficulty', 'Outcome', 'Time / target', 'Marks'],
    [42, 168, 65, 80, 100, 60], questions);

  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    page = currentPage;
    rule(pageHeight - 41);
    text('Verdant Study Workspace', margin, pageHeight - 30, regular, 8.5, muted);
    const label = `Page ${index + 1} of ${pages.length}`;
    text(label, pageWidth - margin - width(label, regular, 8.5), pageHeight - 30, regular, 8.5, muted);
  });

  structure.set(PDFName.of('ParentTreeNextKey'), objects.obj(pages.length));
  for (const item of items) {
    const {page, value, x, top, font, size, color, tag} = item;
    if (!value) continue;
    const baseline = pageHeight - top - size;
    const needsFontFallback = !canEncode(value);
    if (tag) {
      const parents = pageParents.get(page)!;
      const mcid = parents.size();
      parents.push(tag.reference);
      tag.children.push(objects.obj({Type: 'MCR', Pg: page.ref, MCID: mcid}));
      const properties = objects.obj({MCID: mcid, ...(needsFontFallback && {ActualText: PDFHexString.fromText(value)})});
      page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of(tag.role), properties.toString()]));
    } else {
      page.pushOperators(beginMarkedContent('Artifact'));
    }

    if (!needsFontFallback) {
      page.drawText(value, {x, y: baseline, font, size, color});
      page.pushOperators(endMarkedContent());
      continue;
    }
    // Standard PDF fonts are WinAnsi. Use the browser's font fallback for
    // other scripts and keep the source text available to PDF readers.
    const context = canvasContext();
    if (canvas && context) {
      const scale = 3, imageWidth = Math.ceil(width(value, font, size)) + 4, imageHeight = Math.ceil(size * 1.7);
      canvas.width = imageWidth * scale;
      canvas.height = imageHeight * scale;
      context.scale(scale, scale);
      context.font = canvasFont(font, size);
      context.fillStyle = colorCss(color);
      context.fillText(value, 2, size);
      const image = await pdf.embedPng(canvas.toDataURL('image/png'));
      page.drawImage(image, {x: x - 2, y: pageHeight - top - imageHeight, width: imageWidth, height: imageHeight});
    } else {
      page.drawText(fallback(value), {x, y: baseline, font, size, color});
    }
    page.pushOperators(endMarkedContent());
  }
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], {type: 'application/pdf'});
}
