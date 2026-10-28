export type GraphPoint = { x: number; y: number };

/** A bounded cubic curve: control points stay between adjacent measured points.
 * This keeps a zero-count run at zero, with no negative overshoot at a peak. */
export function graphPaths(points: GraphPoint[], baseline: number) {
  if (!points.length) return { line: '', area: '' };
  const start = points[0];
  let line = `M ${start.x} ${start.y}`;
  for (let index = 1; index < points.length; index++) {
    const before = points[index - 1], point = points[index];
    const handle = (point.x - before.x) * .42;
    line += ` C ${before.x + handle} ${before.y}, ${point.x - handle} ${point.y}, ${point.x} ${point.y}`;
  }
  return { line, area: points.length > 1 ? `${line} L ${points.at(-1)!.x} ${baseline} L ${start.x} ${baseline} Z` : '' };
}

/** Count axes use whole questions, including for a wholly empty recorded interval. */
export function countAxis(values: number[]) {
  const highest = Math.max(0, ...values.filter(Number.isFinite));
  const step = Math.max(1, Math.ceil(highest / 4));
  return { ceiling: step * 4, ticks: Array.from({ length: 5 }, (_, index) => index * step) };
}

export function graphLabelIndices(count: number, width: number) {
  if (!count) return [];
  const limit = Math.max(2, Math.floor(width / 105));
  if (count <= limit) return Array.from({ length: count }, (_, index) => index);
  return [...new Set(Array.from({ length: limit }, (_, index) => Math.round(index * (count - 1) / (limit - 1))))];
}
