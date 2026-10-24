import { fileStore } from './store';

export type PdfPoint = { x: number; y: number };
export type PdfRect = PdfPoint & { width: number; height: number };
/** Geometry uses top-left normalized coordinates in the PDF.js native-rotation viewport. */
export type PdfAnnotation = {
  id: string; page: number; kind: 'highlight' | 'ink' | 'ellipse' | 'rectangle' | 'note';
  color: string; width: number; createdAt: number; rects?: PdfRect[]; points?: PdfPoint[]; text?: string;
};
export type PdfAnnotationEnvelope = { version: 1; annotations: PdfAnnotation[] };

const MAX_ANNOTATIONS = 5000, MAX_POINTS = 10000, MAX_TOTAL_POINTS = 200000, MAX_RECTS = 1000, MAX_TOTAL_RECTS = 20000;
const MAX_STORAGE_BYTES = 15 * 1024 * 1024;
const kinds = new Set<PdfAnnotation['kind']>(['highlight', 'ink', 'ellipse', 'rectangle', 'note']);
const clipped = (value: number) => typeof value !== 'number' || Number.isNaN(value) ? 0 : Math.min(1, Math.max(0, value));

export function clampPoint(point: PdfPoint): PdfPoint { return { x: clipped(point.x), y: clipped(point.y) }; }
export function rectFromPoints(a: PdfPoint, b: PdfPoint): PdfRect {
  const first = clampPoint(a), second = clampPoint(b);
  return { x: Math.min(first.x, second.x), y: Math.min(first.y, second.y), width: Math.abs(first.x - second.x), height: Math.abs(first.y - second.y) };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function finite(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be a finite number between ${min} and ${max}.`);
  return value;
}
function string(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} must contain 1–${max.toLocaleString()} characters.`);
  return value;
}
function point(value: unknown): PdfPoint {
  const raw = record(value, 'Annotation point');
  return { x: finite(raw.x, 'Point x', 0, 1), y: finite(raw.y, 'Point y', 0, 1) };
}
function rect(value: unknown): PdfRect {
  const raw = record(value, 'Annotation rectangle'), position = point(raw);
  const width = finite(raw.width, 'Rectangle width', Number.MIN_VALUE, 1), height = finite(raw.height, 'Rectangle height', Number.MIN_VALUE, 1);
  if (position.x + width > 1 + 1e-9 || position.y + height > 1 + 1e-9) throw new Error('Annotation rectangles must stay within the page.');
  // Normalize only floating-point boundary drift; out-of-page data is rejected above.
  const result = { ...position, width: Math.min(width, 1 - position.x), height: Math.min(height, 1 - position.y) };
  if (!result.width || !result.height) throw new Error('An annotation rectangle must have a positive area.');
  return result;
}
function color(value: unknown): string {
  const input = string(value, 'Annotation color', 7);
  if (/^#[\da-f]{6}$/i.test(input)) return input.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(input)) return '#' + [...input.slice(1)].map(char => char + char).join('').toLowerCase();
  throw new Error('Annotation colors must use a hexadecimal color such as #facc15.');
}

/** Chooses the more legible badge label from the reader's dark and light foregrounds. */
export function annotationLabelColor(hex: string): '#2e005b' | '#ffffff' {
  const luminance = (value: string) => {
    const channels = [1, 3, 5].map(index => {
      const channel = parseInt(value.slice(index, index + 2), 16) / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const background = luminance(color(hex)), dark = luminance('#2e005b');
  const darkContrast = (Math.max(background, dark) + .05) / (Math.min(background, dark) + .05);
  const whiteContrast = 1.05 / (background + .05);
  return darkContrast >= whiteContrast ? '#2e005b' : '#ffffff';
}

/** Validates both an in-memory array and a versioned storage envelope; corruption never becomes an empty document. */
export function validateAnnotations(value: unknown, pageCount: number): PdfAnnotation[] {
  finite(pageCount, 'PDF page count', 1, 100000);
  if (!Number.isInteger(pageCount)) throw new Error('PDF page count must be a whole number.');
  let entries: unknown = value;
  if (!Array.isArray(value)) {
    const envelope = record(value, 'Annotations');
    if (envelope.version !== 1) throw new Error('This annotation file has an unsupported version.');
    entries = envelope.annotations;
  }
  if (!Array.isArray(entries) || entries.length > MAX_ANNOTATIONS) throw new Error(`Annotations must contain at most ${MAX_ANNOTATIONS.toLocaleString()} records.`);
  const ids = new Set<string>();
  let totalPoints = 0, totalRects = 0;
  return entries.map((entry): PdfAnnotation => {
    const raw = record(entry, 'Annotation'), id = string(raw.id, 'Annotation ID', 200);
    if (ids.has(id)) throw new Error('Annotation IDs must be unique.');
    ids.add(id);
    const page = finite(raw.page, 'Annotation page', 1, pageCount);
    if (!Number.isInteger(page)) throw new Error('Annotation page must be a whole number.');
    if (!kinds.has(raw.kind as PdfAnnotation['kind'])) throw new Error('The annotation kind is unsupported.');
    const kind = raw.kind as PdfAnnotation['kind'];
    let points: PdfPoint[] | undefined, rects: PdfRect[] | undefined;
    if (raw.points !== undefined) {
      if (!Array.isArray(raw.points) || raw.points.length > MAX_POINTS) throw new Error(`A stroke may contain at most ${MAX_POINTS.toLocaleString()} points.`);
      totalPoints += raw.points.length;
      if (totalPoints > MAX_TOTAL_POINTS) throw new Error('This document contains too many annotation points.');
      points = raw.points.map(point);
    }
    if (raw.rects !== undefined) {
      if (!Array.isArray(raw.rects) || raw.rects.length > MAX_RECTS) throw new Error(`An annotation may contain at most ${MAX_RECTS.toLocaleString()} rectangles.`);
      totalRects += raw.rects.length;
      if (totalRects > MAX_TOTAL_RECTS) throw new Error('This document contains too many annotation rectangles.');
      rects = raw.rects.map(rect);
    }
    if (kind === 'ink' && !points?.length) throw new Error('An ink annotation needs at least one point.');
    if (kind === 'highlight' && !rects?.length) throw new Error('A highlight needs at least one rectangle.');
    if (['ellipse', 'rectangle', 'note'].includes(kind) && rects?.length !== 1) throw new Error(`${kind} annotations need exactly one placement rectangle.`);
    const text = raw.text === undefined ? undefined : typeof raw.text === 'string' && raw.text.length <= 20000 ? raw.text : (() => { throw new Error('Annotation text must contain at most 20,000 characters.'); })();
    if (kind === 'note' && !text?.trim()) throw new Error('A note needs text.');
    const createdAt = finite(raw.createdAt, 'Annotation timestamp', 0, Number.MAX_SAFE_INTEGER);
    if (!Number.isInteger(createdAt)) throw new Error('Annotation timestamp must be a whole number.');
    return { id, page, kind, color: color(raw.color), width: raw.width === undefined ? .003 : finite(raw.width, 'Annotation stroke width', .0001, .05), createdAt,
      ...(rects === undefined ? {} : { rects }), ...(points === undefined ? {} : { points }), ...(text === undefined ? {} : { text }) };
  });
}

export function annotationKey(fileKey: string): string { return `${string(fileKey, 'Material file key', 2000)}:annotations:v1`; }
export async function loadAnnotations(fileKey: string, pageCount: number): Promise<PdfAnnotation[]> {
  validateAnnotations([], pageCount);
  const blob = await fileStore('get', annotationKey(fileKey));
  if (!blob) return [];
  if (!(blob instanceof Blob)) throw new Error('The saved annotations have an invalid storage format.');
  if (blob.size > MAX_STORAGE_BYTES) throw new Error('The saved annotation file is too large.');
  let parsed: unknown;
  try { parsed = JSON.parse(await blob.text()); } catch { throw new Error('The saved annotations could not be read. Keep the stored copy and try again.'); }
  return validateAnnotations(parsed, pageCount);
}
export async function saveAnnotations(fileKey: string, annotations: PdfAnnotation[]): Promise<void> {
  if (!Array.isArray(annotations)) throw new Error('Annotations must be an array.');
  const pageCount = annotations.reduce((highest, annotation) => Math.max(highest, annotation?.page ?? 1), 1);
  const checked = validateAnnotations(annotations, pageCount);
  const envelope: PdfAnnotationEnvelope = { version: 1, annotations: checked };
  const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
  if (blob.size > MAX_STORAGE_BYTES) throw new Error('The annotations are too large to save.');
  await fileStore('put', annotationKey(fileKey), blob);
}

/** Draws onto the existing canvas without clearing it, allowing both overlays and PDF captures. */
export function drawPdfAnnotations(ctx: CanvasRenderingContext2D, annotations: PdfAnnotation[], page: number, width: number, height: number, options: { noteText?: boolean } = {}): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Canvas page dimensions must be positive.');
  for (const annotation of annotations) {
    if (annotation.page !== page) continue;
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = annotation.color; ctx.fillStyle = annotation.color;
    ctx.lineWidth = annotation.width * width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (annotation.kind === 'highlight') {
      ctx.globalAlpha = .28;
      for (const rect of annotation.rects ?? []) ctx.fillRect(rect.x * width, rect.y * height, rect.width * width, rect.height * height);
    } else if (annotation.kind === 'ink' && annotation.points?.length) {
      const first = annotation.points[0]; ctx.beginPath(); ctx.moveTo(first.x * width, first.y * height);
      for (const point of annotation.points.slice(1)) ctx.lineTo(point.x * width, point.y * height);
      if (annotation.points.length > 1) ctx.stroke();
      else { ctx.arc(first.x * width, first.y * height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    } else if (annotation.rects?.[0]) {
      const rect = annotation.rects[0], x = rect.x * width, y = rect.y * height, w = rect.width * width, h = rect.height * height;
      if (annotation.kind === 'rectangle') ctx.strokeRect(x, y, w, h);
      else if (annotation.kind === 'ellipse') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.stroke(); }
      else if (annotation.kind === 'note') {
        const size = Math.max(14, Math.min(24, Math.min(w, h))), badgeX = Math.max(0, Math.min(width - size, x)), badgeY = Math.max(0, Math.min(height - size, y));
        ctx.beginPath(); ctx.arc(badgeX + size / 2, badgeY + size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = annotationLabelColor(annotation.color); ctx.font = `bold ${Math.max(10, size * .6)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', badgeX + size / 2, badgeY + size / 2);
        if (options.noteText && annotation.text) drawNoteText(ctx, annotation, badgeX, badgeY, size, width, height);
      }
    }
    ctx.restore();
  }
}
function drawNoteText(ctx: CanvasRenderingContext2D, annotation: PdfAnnotation, x: number, y: number, badgeSize: number, width: number, height: number) {
  if (width < 40 || height < 40) return;
  const fontSize = Math.max(11, Math.min(16, width * .018)), lineHeight = fontSize * 1.45, padding = 9;
  const boxWidth = Math.min(Math.max(180, width * .35), width - 8), boxX = Math.max(4, Math.min(width - boxWidth - 4, x + badgeSize + 6));
  ctx.font = `${fontSize}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const lines: string[] = [];
  for (const paragraph of (annotation.text ?? '').split('\n')) {
    let line = '';
    for (const char of Array.from(paragraph)) { const next = line + char; if (line && ctx.measureText(next).width > boxWidth - padding * 2) { lines.push(line); line = char; } else line = next; }
    lines.push(line);
  }
  const maxLines = Math.max(1, Math.floor((height - padding * 2 - 8) / lineHeight)), visible = lines.slice(0, maxLines);
  if (visible.length < lines.length) visible[visible.length - 1] = visible[visible.length - 1].replace(/.$/, '') + '…';
  const boxHeight = visible.length * lineHeight + padding * 2, boxY = Math.max(4, Math.min(height - boxHeight - 4, y));
  ctx.globalAlpha = .96; ctx.fillStyle = '#ffffff'; ctx.fillRect(boxX, boxY, boxWidth, boxHeight); ctx.globalAlpha = 1;
  ctx.strokeStyle = annotation.color; ctx.lineWidth = 1; ctx.strokeRect(boxX, boxY, boxWidth, boxHeight); ctx.fillStyle = '#183427';
  visible.forEach((line, index) => ctx.fillText(line, boxX + padding, boxY + padding + index * lineHeight));
}
