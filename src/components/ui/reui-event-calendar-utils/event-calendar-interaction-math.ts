/** Date-only layout envelopes must never turn into 24-hour study sessions. */
export function timedMoveDurationMs(allDay: boolean, durationMs: number, preferredMinutes: number | undefined, fallbackMinutes: number): number {
  if (!allDay) return durationMs;
  const minutes = typeof preferredMinutes === 'number' && Number.isFinite(preferredMinutes) && preferredMinutes > 0 ? preferredMinutes : fallbackMinutes;
  return minutes * 60000;
}

/** Adjust one clock edge while keeping the other fixed, inside visible bounds. */
export function resizeCalendarEdge(start: number, end: number, edge: 'start' | 'end', deltaMinutes: number, boundsStart: number, boundsEnd: number, minimumMinutes: number): {start:number;end:number} | null {
  if (![start,end,deltaMinutes,boundsStart,boundsEnd,minimumMinutes].every(Number.isFinite) || end <= start || boundsEnd <= boundsStart || minimumMinutes <= 0) return null;
  const minimumMs = Math.min(minimumMinutes * 60000, end - start);
  if (edge === 'start') {
    const next = Math.max(boundsStart, Math.min(start + deltaMinutes * 60000, end - minimumMs, boundsEnd));
    return next < end && next !== start ? {start:next,end} : null;
  }
  const next = Math.min(boundsEnd, Math.max(end + deltaMinutes * 60000, start + minimumMs, boundsStart));
  return next > start && next !== end ? {start,end:next} : null;
}
