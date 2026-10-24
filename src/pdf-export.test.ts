import { describe, expect, it } from 'vitest';
import { PDFDocument, degrees, StandardFonts } from 'pdf-lib';
import { exportAnnotatedPdf, normalizeCaptureSelection, pdfPointFromNormalized, pdfRectFromNormalized, pdfViewportGeometry } from './pdf-export';
import type { PdfAnnotation } from './pdf-annotations';

// In-memory documents are test fixtures only; no material is seeded in the app.
describe('PDF.js native viewport to PDF export geometry', () => {
  it.each([
    [0, 52, 430, 52, 280, 80, 150],
    [90, 84, 80, 84, 80, 96, 125],
    [180, 308, 130, 228, 130, 80, 150],
    [270, 276, 480, 180, 355, 96, 125],
  ])('maps a cropped page rotated %i degrees without moving annotations', async (rotation, pointX, pointY, x, y, width, height) => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([400, 600]); page.setCropBox(20, 30, 320, 500); page.setRotation(degrees(rotation));
    const geometry = pdfViewportGeometry(page);
    const point = pdfPointFromNormalized({ x: .1, y: .2 }, geometry);
    expect(point.x).toBeCloseTo(pointX); expect(point.y).toBeCloseTo(pointY);
    const rect = pdfRectFromNormalized({ x: .1, y: .2, width: .25, height: .3 }, geometry);
    expect(rect.x).toBeCloseTo(x); expect(rect.y).toBeCloseTo(y);
    expect(rect.width).toBeCloseTo(width); expect(rect.height).toBeCloseTo(height);
  });

  it('matches the visible crop/media intersection and normalizes negative rotation', async () => {
    const pdf = await PDFDocument.create(), page = pdf.addPage([400, 600]);
    page.setCropBox(-10, -20, 500, 800); page.setRotation(degrees(-90));
    expect(pdfViewportGeometry(page)).toEqual({ box: { x: 0, y: 0, width: 400, height: 600 }, rotation: 270, width: 600, height: 400 });
  });
});

describe('annotated PDF download copies', () => {
  it('preserves original bytes, metadata, pages, crop, rotation and forms while adding vector overlays', async () => {
    const pdf = await PDFDocument.create(); pdf.setTitle('Original uploaded study material');
    const first = pdf.addPage([400, 600]), second = pdf.addPage([620, 410]);
    first.setCropBox(20, 30, 320, 500); first.setRotation(degrees(90)); second.setRotation(degrees(270));
    const font = await pdf.embedFont(StandardFonts.Helvetica); first.drawText('Original selectable content', { x: 40, y: 510, font });
    const form = pdf.getForm(), field = form.createTextField('student-name'); field.setText('Saved form value'); field.addToPage(second, { x: 35, y: 45, width: 170, height: 25 });
    const bytes = await pdf.save(), original = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const annotations: PdfAnnotation[] = [
      { id: 'highlight-user', page: 1, kind: 'highlight', color: '#facc15', width: .003, createdAt: 1, rects: [{ x: .1, y: .2, width: .25, height: .04 }] },
      { id: 'ink-user', page: 2, kind: 'ink', color: '#6a43ff', width: .004, createdAt: 2, points: [{ x: .2, y: .3 }, { x: .6, y: .5 }] },
      { id: 'ellipse-user', page: 2, kind: 'ellipse', color: '#ef4444', width: .002, createdAt: 3, rects: [{ x: .3, y: .3, width: .2, height: .25 }] },
    ];
    const output = await exportAnnotatedPdf(original, annotations), result = await PDFDocument.load(await output.arrayBuffer());
    expect(output.type).toBe('application/pdf'); expect(output.size).toBeGreaterThan(original.size);
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes);
    expect(result.getPageCount()).toBe(2); expect(result.getTitle()).toBe('Original uploaded study material');
    expect(result.getPage(0).getCropBox()).toEqual(first.getCropBox());
    expect(result.getPages().map(page => page.getRotation().angle)).toEqual([90, 270]);
    expect(result.getForm().getTextField('student-name').getText()).toBe('Saved form value');
  });

  it('returns byte-identical original content when there are no new annotations', async () => {
    const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save();
    const original = new Blob([new Uint8Array(bytes)]), output = await exportAnnotatedPdf(original, []);
    expect(new Uint8Array(await output.arrayBuffer())).toEqual(bytes);
  });

  it('rejects an annotation pointing outside the original document', async () => {
    const pdf = await PDFDocument.create(); pdf.addPage(); const original = new Blob([new Uint8Array(await pdf.save())]);
    await expect(exportAnnotatedPdf(original, [{ id: 'outside-page', page: 2, kind: 'rectangle', color: '#6a43ff', width: .003, createdAt: 1, rects: [{ x: .1, y: .1, width: .2, height: .2 }] }])).rejects.toThrow('Annotation page');
  });
});

describe('high-resolution capture selection', () => {
  it('normalizes backward drags and clips only the area outside the page', () => {
    const backward = normalizeCaptureSelection({ x: .8, y: .7, width: -.5, height: -.4 });
    expect(backward.x).toBeCloseTo(.3); expect(backward.y).toBeCloseTo(.3);
    expect(backward.width).toBeCloseTo(.5); expect(backward.height).toBeCloseTo(.4);
    const clipped = normalizeCaptureSelection({ x: -.1, y: .2, width: .4, height: .9 });
    expect(clipped.x).toBe(0); expect(clipped.y).toBe(.2);
    expect(clipped.width).toBeCloseTo(.3); expect(clipped.height).toBeCloseTo(.8);
  });

  it('rejects non-finite and fully out-of-page selections', () => {
    expect(() => normalizeCaptureSelection({ x: NaN, y: 0, width: .2, height: .2 })).toThrow('inside the page');
    expect(() => normalizeCaptureSelection({ x: 1.2, y: .2, width: .2, height: .2 })).toThrow('inside the page');
  });
});
