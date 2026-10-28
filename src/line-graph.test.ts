import { describe, expect, it } from 'vitest';
import { countAxis, graphLabelIndices, graphPaths } from './line-graph';

describe('measured-count line graph geometry', () => {
  it('keeps zero intervals, peaks, and troughs within their measured bounds', () => {
    const { line, area } = graphPaths([{ x: 0, y: 100 }, { x: 100, y: 0 }, { x: 200, y: 100 }, { x: 300, y: 100 }], 100);
    const segments = [...line.matchAll(/C ([\d.]+) ([\d.]+), ([\d.]+) ([\d.]+), ([\d.]+) ([\d.]+)/g)].map(match => match.slice(1).map(Number));
    let start = { x: 0, y: 100 };
    segments.forEach(segment => {
      const [cx1, cy1, cx2, cy2, endX, endY] = segment;
      for (let i = 0; i <= 100; i++) {
        const t = i / 100, u = 1 - t;
        const x = u ** 3 * start.x + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t ** 3 * endX;
        const y = u ** 3 * start.y + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t ** 3 * endY;
        expect(x).toBeGreaterThanOrEqual(start.x - 1e-9); expect(x).toBeLessThanOrEqual(endX + 1e-9);
        expect(y).toBeGreaterThanOrEqual(Math.min(start.y, endY) - 1e-9); expect(y).toBeLessThanOrEqual(Math.max(start.y, endY) + 1e-9);
      }
      start = { x: endX, y: endY };
    });
    expect(area).toMatch(/L 300 100 L 0 100 Z$/);
  });
  it('does not draw an invented area from one observation or missing data', () => {
    expect(graphPaths([], 100)).toEqual({ line: '', area: '' });
    expect(graphPaths([{ x: 50, y: 20 }], 100)).toEqual({ line: 'M 50 20', area: '' });
  });
  it('shows whole-question reference ticks for zero, small, and large counts', () => {
    for (const values of [[], [0, 0], [1, 2], [23, 1, 24], [1500, 2500]]) {
      const { ceiling, ticks } = countAxis(values);
      expect(ceiling).toBeGreaterThanOrEqual(Math.max(0, ...values));
      expect(ticks.every(Number.isInteger)).toBe(true);
      expect(ticks[0]).toBe(0); expect(ticks.at(-1)).toBe(ceiling);
    }
  });
  it('retains the first and final interval on a narrow screen without repeating labels', () => {
    const indices = graphLabelIndices(30, 260);
    expect(indices[0]).toBe(0); expect(indices.at(-1)).toBe(29);
    expect(new Set(indices).size).toBe(indices.length);
    expect(graphLabelIndices(1, 260)).toEqual([0]);
    expect(graphLabelIndices(0, 260)).toEqual([]);
  });
});
