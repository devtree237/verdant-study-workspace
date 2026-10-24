import { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle } from 'pdf-lib';
import type { PDFPage, PDFFont } from 'pdf-lib';
import { drawPdfAnnotations, validateAnnotations } from './pdf-annotations';
import type { PdfAnnotation, PdfRect } from './pdf-annotations';

type Point = { x: number; y: number };
type PageBox = { x: number; y: number; width: number; height: number };
// Browser canvas resolves fallback per glyph, preserving Indic shaping and symbols
// where those system fonts are installed; it avoids PDF StandardFonts encodings.
const NOTE_FONT_STACK = 'Inter, "Nirmala UI", "Noto Sans Devanagari", "Segoe UI Symbol", sans-serif';
export type PdfPageGeometry = { box: PageBox; rotation: number; width: number; height: number };

/** Equivalent to PDF.js's default PageViewport inverse transform. Normalized
 * coordinates cancel the UserUnit/zoom scale; crop offsets and native rotation
 * are kept. No page is rasterized or rendered during vector export. */
export function pdfViewportGeometry(page: Pick<PDFPage, 'getCropBox' | 'getMediaBox' | 'getRotation'>): PdfPageGeometry {
  const crop = page.getCropBox(), media = page.getMediaBox();
  const left = Math.max(crop.x, media.x), bottom = Math.max(crop.y, media.y);
  const right = Math.min(crop.x + crop.width, media.x + media.width);
  const top = Math.min(crop.y + crop.height, media.y + media.height);
  const box = right > left && top > bottom ? { x: left, y: bottom, width: right - left, height: top - bottom } : media;
  const angle = page.getRotation().angle;
  const rotation = Number.isFinite(angle) && angle % 90 === 0 ? ((angle % 360) + 360) % 360 : 0;
  return { box, rotation, width: rotation % 180 ? box.height : box.width, height: rotation % 180 ? box.width : box.height };
}

export function pdfPointFromNormalized(point: Point, geometry: PdfPageGeometry): Point {
  const { box: b, rotation } = geometry;
  if (rotation === 90) return { x: b.x + point.y * b.width, y: b.y + point.x * b.height };
  if (rotation === 180) return { x: b.x + (1 - point.x) * b.width, y: b.y + point.y * b.height };
  if (rotation === 270) return { x: b.x + (1 - point.y) * b.width, y: b.y + (1 - point.x) * b.height };
  return { x: b.x + point.x * b.width, y: b.y + (1 - point.y) * b.height };
}

export function pdfRectFromNormalized(rect: PdfRect, geometry: PdfPageGeometry): PageBox {
  const corners = [
    pdfPointFromNormalized({ x: rect.x, y: rect.y }, geometry),
    pdfPointFromNormalized({ x: rect.x + rect.width, y: rect.y }, geometry),
    pdfPointFromNormalized({ x: rect.x, y: rect.y + rect.height }, geometry),
    pdfPointFromNormalized({ x: rect.x + rect.width, y: rect.y + rect.height }, geometry),
  ];
  const x = Math.min(...corners.map(point => point.x)), y = Math.min(...corners.map(point => point.y));
  return { x, y, width: Math.max(...corners.map(point => point.x)) - x, height: Math.max(...corners.map(point => point.y)) - y };
}

function annotationColor(color: string) {
  const hex = color.replace('#', '');
  if (!/^[\da-f]{6}$/i.test(hex)) throw new Error('An annotation has an invalid color. Choose a color again before exporting.');
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

function drawNoteBadge(page: PDFPage, annotation: PdfAnnotation, geometry: PdfPageGeometry, index: number, font: PDFFont) {
  const anchor = annotation.rects?.[0];
  if (!anchor) return;
  const label = `N${index}`;
  const width = Math.max(22, font.widthOfTextAtSize(label, 8) + 8), height = 16;
  const rect = { x: Math.max(0, Math.min(anchor.x, 1 - width / geometry.width)), y: Math.max(0, Math.min(anchor.y, 1 - height / geometry.height)), width: width / geometry.width, height: height / geometry.height };
  page.drawRectangle({ ...pdfRectFromNormalized(rect, geometry), color: annotationColor(annotation.color), opacity: .95 });
  const position = pdfPointFromNormalized({ x: rect.x + 4 / geometry.width, y: rect.y + 11.5 / geometry.height }, geometry);
  const hex = annotation.color.slice(1), brightness = (parseInt(hex.slice(0, 2), 16) * .299 + parseInt(hex.slice(2, 4), 16) * .587 + parseInt(hex.slice(4, 6), 16) * .114) / 255;
  page.drawText(label, { ...position, font, size: 8, color: brightness > .62 ? rgb(.18, 0, .36) : rgb(1, 1, 1), rotate: degrees(geometry.rotation) });
}

function requireCanvas(width: number, height: number) {
  if (typeof document === 'undefined') throw new Error('Notes and image capture need a browser with canvas support.');
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not create an image. Try opening Verdant in a current browser.');
  return { canvas, context };
}

function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Your browser could not save this image.')), 'image/png'); }
    catch { reject(new Error('This page image could not be captured. Reload the document and try again.')); }
  });
}

/** Wraps complete Unicode graphemes without a limited PDF font encoding. */
function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maximum: number): string[] {
  const lines: string[] = [];
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => { segment: (text: string) => Iterable<{ segment: string }> } }).Segmenter;
  const segmenter = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : null;
  for (const paragraph of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let line = '';
    for (const character of segmenter ? Array.from(segmenter.segment(paragraph), part => part.segment) : Array.from(paragraph)) {
      if (line && context.measureText(line + character).width > maximum) { lines.push(line); line = ''; }
      line += character;
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function appendNotes(documentPdf: PDFDocument, notes: PdfAnnotation[]) {
  if (!notes.length) return;
  if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;
  const scale = 2, pageWidth = 595, pageHeight = 842, margin = 42, lineHeight = 17, bottom = 795;
  const { canvas, context } = requireCanvas(pageWidth * scale, pageHeight * scale);
  let y = 0, appendix = 0;
  const begin = () => {
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, pageWidth, pageHeight);
    context.textBaseline = 'alphabetic'; context.fillStyle = '#2e005b'; context.font = `600 17px ${NOTE_FONT_STACK}`;
    context.fillText('Verdant notes', margin, 43);
    context.fillStyle = '#746a80'; context.font = `10px ${NOTE_FONT_STACK}`;
    context.fillText('Notes are keyed to numbered badges on the original pages.', margin, 62);
    context.fillText(`Notes appendix ${++appendix}`, margin, pageHeight - 24);
    y = 94;
  };
  const commit = async () => {
    const image = await documentPdf.embedPng(await (await pngBlob(canvas)).arrayBuffer());
    const page = documentPdf.addPage([pageWidth, pageHeight]);
    page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  };
  begin();
  for (let index = 0; index < notes.length; index++) {
    const note = notes[index];
    if (y + 50 > bottom) { await commit(); begin(); }
    const heading = (continued = false) => {
      context.fillStyle = note.color; context.fillRect(margin, y - 9, 8, 8);
      context.fillStyle = '#5732d6'; context.font = `600 11px ${NOTE_FONT_STACK}`;
      context.fillText(`N${index + 1} - Source page ${note.page}${continued ? ' (continued)' : ''}`, margin + 15, y);
      y += 23;
      context.fillStyle = '#342447'; context.font = `11px ${NOTE_FONT_STACK}`;
    };
    heading();
    const lines = wrapCanvasText(context, note.text || '', pageWidth - margin * 2);
    for (const line of lines) {
      if (y + lineHeight > bottom) { await commit(); begin(); heading(true); }
      context.fillText(line, margin, y); y += lineHeight;
    }
    y += 22;
  }
  await commit(); canvas.width = 0; canvas.height = 0;
}

/** Saves a copy: existing page content/forms remain intact; new overlays are
 * flattened. Full Unicode note content is included in appended notes pages. */
export async function exportAnnotatedPdf(original: Blob, annotations: PdfAnnotation[]): Promise<Blob> {
  if (!annotations.length) return original.slice(0, original.size, 'application/pdf');
  let documentPdf: PDFDocument;
  try { documentPdf = await PDFDocument.load(await original.arrayBuffer(), { updateMetadata: false }); }
  catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.name + error.message)) throw new Error('Unlock this PDF before exporting annotations.');
    throw new Error('This PDF could not be exported. Reload the original document and try again.');
  }
  const validated = validateAnnotations(annotations, documentPdf.getPageCount());
  if (validated.length !== annotations.length) throw new Error('Some annotations are invalid. Reload the document before exporting.');
  const notes = validated.filter(annotation => annotation.kind === 'note');
  const noteFont = notes.length ? await documentPdf.embedFont(StandardFonts.HelveticaBold) : null;
  for (const annotation of validated) {
    const page = documentPdf.getPage(annotation.page - 1), geometry = pdfViewportGeometry(page);
    const color = annotationColor(annotation.color), thickness = annotation.width * geometry.width;
    if (annotation.kind === 'note') {
      if (noteFont) drawNoteBadge(page, annotation, geometry, notes.indexOf(annotation) + 1, noteFont);
    } else if (annotation.kind === 'ink') {
      const points = annotation.points || [];
      if (points.length === 1) { const point = pdfPointFromNormalized(points[0], geometry); page.drawCircle({ ...point, size: thickness / 2, color }); }
      for (let index = 1; index < points.length; index++) page.drawLine({ start: pdfPointFromNormalized(points[index - 1], geometry), end: pdfPointFromNormalized(points[index], geometry), color, thickness, lineCap: LineCapStyle.Round });
    } else for (const rect of annotation.rects || []) {
      const box = pdfRectFromNormalized(rect, geometry);
      if (annotation.kind === 'highlight') page.drawRectangle({ ...box, color, opacity: .28 });
      else if (annotation.kind === 'ellipse') page.drawEllipse({ x: box.x + box.width / 2, y: box.y + box.height / 2, xScale: box.width / 2, yScale: box.height / 2, borderColor: color, borderWidth: thickness, borderLineCap: LineCapStyle.Round });
      else page.drawRectangle({ ...box, borderColor: color, borderWidth: thickness, borderLineCap: LineCapStyle.Round });
    }
  }
  await appendNotes(documentPdf, notes);
  const bytes = await documentPdf.save({ addDefaultPage: false });
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
}

export function normalizeCaptureSelection(selection: PdfRect): PdfRect {
  if (![selection.x, selection.y, selection.width, selection.height].every(Number.isFinite)) throw new Error('Choose an area inside the page to capture.');
  const x = Math.max(0, Math.min(1, Math.min(selection.x, selection.x + selection.width)));
  const y = Math.max(0, Math.min(1, Math.min(selection.y, selection.y + selection.height)));
  const right = Math.max(0, Math.min(1, Math.max(selection.x, selection.x + selection.width)));
  const bottom = Math.max(0, Math.min(1, Math.max(selection.y, selection.y + selection.height)));
  if (right <= x || bottom <= y) throw new Error('Choose an area inside the page to capture.');
  return { x, y, width: right - x, height: bottom - y };
}

/** Uses the source canvas's backing pixels, so DPR/zoom never lowers resolution.
 * Ellipse captures keep transparent pixels outside the selected ellipse. */
export async function capturePdfRegion(source: HTMLCanvasElement, annotations: PdfAnnotation[], page: number, selection: PdfRect, shape: 'rectangle' | 'ellipse'): Promise<Blob> {
  if (!source.width || !source.height) throw new Error('Wait until the PDF page has finished loading before capturing it.');
  const rect = normalizeCaptureSelection(selection);
  const x = Math.floor(rect.x * source.width), y = Math.floor(rect.y * source.height);
  const width = Math.min(source.width - x, Math.ceil((rect.x + rect.width) * source.width) - x);
  const height = Math.min(source.height - y, Math.ceil((rect.y + rect.height) * source.height) - y);
  if (width < 2 || height < 2) throw new Error('Select a slightly larger area to capture.');
  if (width * height > 32_000_000) throw new Error('Select a smaller area or lower the page zoom before capturing.');
  const { canvas, context } = requireCanvas(width, height);
  try {
    context.save();
    if (shape === 'ellipse') { context.beginPath(); context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2); context.clip(); }
    context.drawImage(source, x, y, width, height, 0, 0, width, height);
    context.translate(-x, -y);
    drawPdfAnnotations(context, annotations, page, source.width, source.height, { noteText: true });
    context.restore();
    return await pngBlob(canvas);
  } finally { canvas.width = 0; canvas.height = 0; }
}
