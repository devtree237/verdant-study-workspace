import { validateAttempt } from './testing-model';

/** Guarded attempts resume in the exam route, including after a changed URL hash.
 * This is a local navigation fence, not an authorization boundary. */
export function resolveWorkspaceRoute(hash: string, testingJSON: string | null): string {
  if (testingJSON) {
    try {
      const saved = JSON.parse(testingJSON);
      if (saved?.version === 1 && saved.activeAttempt) {
        const attempt = validateAttempt(saved.activeAttempt);
        if (attempt.status === 'running' && attempt.integrity?.policy.mode === 'guarded') return 'Test Centre';
      }
    } catch { /* The Test Centre retains and reports invalid stored work. */ }
  }
  try { return decodeURIComponent(hash.replace(/^#/, '')) || 'Today'; }
  catch { return 'Today'; }
}
export function currentWorkspaceRoute(hash: string): string {
  let saved: string | null = null;
  try { saved = localStorage.getItem('verdant.testing.v1'); } catch { /* In-memory practice still works. */ }
  return resolveWorkspaceRoute(hash, saved);
}
