import { beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => ({ blobs: new Map<string, Blob>(), error: null as Error | null }));
vi.mock('./store', () => ({ fileStore: vi.fn(async (action: 'get' | 'put', key: string, blob?: Blob) => {
  if (stored.error) throw stored.error;
  if (action === 'put') { stored.blobs.set(key, blob!); return undefined; }
  return stored.blobs.get(key);
}) }));

import { annotationKey, annotationLabelColor, clampPoint, loadAnnotations, rectFromPoints, saveAnnotations, validateAnnotations, type PdfAnnotation } from './pdf-annotations';

const highlight = (overrides: Partial<PdfAnnotation> = {}): PdfAnnotation => ({
  id: 'highlight', page: 1, kind: 'highlight', color: '#facc15', width: .003, createdAt: 1000,
  rects: [{ x: .1, y: .2, width: .3, height: .04 }], ...overrides,
});
beforeEach(() => { stored.blobs.clear(); stored.error = null; });

describe('normalized PDF annotation geometry', () => {
  it('keeps note labels legible on yellow and violet badges rather than using a fixed white label', () => {
    expect(annotationLabelColor('#facc15')).toBe('#2e005b');
    expect(annotationLabelColor('#FA2')).toBe('#2e005b');
    expect(annotationLabelColor('#6a43ff')).toBe('#ffffff');
    expect(annotationLabelColor('#2E005B')).toBe('#ffffff');
    expect(annotationLabelColor('#ffffff')).toBe('#2e005b');
    const luminance = (hex: string) => {
      const rgb = hex.match(/[\da-f]{2}/gi)!.map(channel => parseInt(channel, 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4));
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    expect(contrast('#facc15', annotationLabelColor('#facc15'))).toBeGreaterThanOrEqual(7);
    expect(contrast('#6a43ff', annotationLabelColor('#6a43ff'))).toBeGreaterThanOrEqual(4.5);
  });
  it('clamps pointer coordinates and builds positive rectangles regardless of drag direction', () => {
    expect(clampPoint({ x: -.1, y: 1.4 })).toEqual({ x: 0, y: 1 });
    expect(clampPoint({ x: NaN, y: Infinity })).toEqual({ x: 0, y: 1 });
    expect(rectFromPoints({ x: .8, y: .9 }, { x: .2, y: .1 })).toEqual({ x: .2, y: .1, width: .6000000000000001, height: .8 });
    expect(rectFromPoints({ x: -1, y: 3 }, { x: 2, y: -1 })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
  it('canonicalizes valid colors and tolerates only arithmetic drift at the page edge', () => {
    const source = highlight({ color: '#Fa2', rects: [{ x: .8, y: .4, width: .20000000000000004, height: .2 }] });
    const [checked] = validateAnnotations({ version: 1, annotations: [source] }, 3);
    expect(checked.color).toBe('#ffaa22');
    expect(checked.rects![0].x + checked.rects![0].width).toBeLessThanOrEqual(1);
    expect(source.color).toBe('#Fa2');
    expect(validateAnnotations([{ ...highlight(), width: undefined }], 1)[0].width).toBe(.003);
  });
  it('rejects off-page, nonfinite, zero-area and invalid-page geometry instead of clipping saved corruption', () => {
    expect(() => validateAnnotations([highlight({ page: 2 })], 1)).toThrow('Annotation page');
    expect(() => validateAnnotations([highlight({ page: 1.5 })], 2)).toThrow('whole number');
    expect(() => validateAnnotations([highlight({ rects: [{ x: .9, y: .2, width: .2, height: .1 }] })], 1)).toThrow('within the page');
    expect(() => validateAnnotations([highlight({ rects: [{ x: NaN, y: .2, width: .2, height: .1 }] })], 1)).toThrow('finite');
    expect(() => validateAnnotations([highlight({ rects: [{ x: .1, y: .2, width: 0, height: .1 }] })], 1)).toThrow('Rectangle width');
    expect(() => validateAnnotations([], 0)).toThrow('page count');
  });
});

describe('annotation record validation', () => {
  it('requires geometry appropriate to each tool and actual note text', () => {
    const ink = highlight({ kind: 'ink', rects: undefined, points: [{ x: .2, y: .3 }] });
    expect(validateAnnotations([ink], 1)[0].points).toEqual([{ x: .2, y: .3 }]);
    expect(() => validateAnnotations([highlight({ kind: 'ink', rects: undefined })], 1)).toThrow('at least one point');
    expect(() => validateAnnotations([highlight({ kind: 'rectangle', rects: [] })], 1)).toThrow('exactly one');
    expect(() => validateAnnotations([highlight({ kind: 'ellipse', rects: [...highlight().rects!, ...highlight().rects!] })], 1)).toThrow('exactly one');
    expect(() => validateAnnotations([highlight({ kind: 'note', text: '   ' })], 1)).toThrow('needs text');
    expect(validateAnnotations([highlight({ kind: 'note', text: 'A real note\nwith another line' })], 1)[0].text).toBe('A real note\nwith another line');
  });
  it('rejects unsupported versions, duplicate IDs, invalid colors and invalid stroke widths', () => {
    expect(() => validateAnnotations({ version: 2, annotations: [] }, 1)).toThrow('unsupported version');
    expect(() => validateAnnotations({ annotations: [] }, 1)).toThrow('unsupported version');
    expect(() => validateAnnotations([highlight(), highlight()], 1)).toThrow('unique');
    expect(() => validateAnnotations([highlight({ color: 'red' })], 1)).toThrow('hexadecimal');
    expect(() => validateAnnotations([highlight({ width: -1 })], 1)).toThrow('stroke width');
    expect(() => validateAnnotations([highlight({ createdAt: Infinity })], 1)).toThrow('timestamp');
  });
  it('bounds record and per-stroke geometry counts before processing oversized data', () => {
    expect(() => validateAnnotations(Array.from({ length: 5001 }, () => highlight()), 1)).toThrow('5,000');
    expect(() => validateAnnotations([highlight({ kind: 'ink', points: Array.from({ length: 10001 }, () => ({ x: .2, y: .3 })) })], 1)).toThrow('10,000');
    expect(() => validateAnnotations([highlight({ rects: Array.from({ length: 1001 }, () => highlight().rects![0]) })], 1)).toThrow('1,000');
  });
});

describe('per-material annotation persistence', () => {
  it('serializes a versioned Blob and restores actual annotations without sharing data across file keys', async () => {
    await saveAnnotations('material-one', [highlight()]);
    await saveAnnotations('material-two', [highlight({ id: 'other', kind: 'note', text: 'Second document' })]);
    expect(annotationKey('material-one')).toBe('material-one:annotations:v1');
    expect(annotationKey('material-one')).not.toBe(annotationKey('material-two'));
    expect(JSON.parse(await stored.blobs.get(annotationKey('material-one'))!.text())).toEqual({ version: 1, annotations: [highlight()] });
    expect(await loadAnnotations('material-one', 1)).toEqual([highlight()]);
    expect((await loadAnnotations('material-two', 1))[0].text).toBe('Second document');
    expect(await loadAnnotations('not-annotated', 1)).toEqual([]);
  });
  it('keeps corrupted and unsupported stored data intact while reporting an error', async () => {
    const key = annotationKey('corrupted'), corrupt = new Blob(['{not JSON']);
    stored.blobs.set(key, corrupt);
    await expect(loadAnnotations('corrupted', 2)).rejects.toThrow('could not be read');
    expect(stored.blobs.get(key)).toBe(corrupt);
    stored.blobs.set(key, new Blob([JSON.stringify({ version: 9, annotations: [] })]));
    await expect(loadAnnotations('corrupted', 2)).rejects.toThrow('unsupported version');
    await expect(saveAnnotations('corrupted', [highlight({ page: NaN })])).rejects.toThrow();
    expect(JSON.parse(await stored.blobs.get(key)!.text()).version).toBe(9);
  });
  it('propagates storage failures to the reader so it can expose unsaved annotations', async () => {
    stored.error = new Error('Browser storage is full');
    await expect(saveAnnotations('material', [highlight()])).rejects.toThrow('storage is full');
    await expect(loadAnnotations('material', 1)).rejects.toThrow('storage is full');
    expect(stored.blobs.size).toBe(0);
  });
});
