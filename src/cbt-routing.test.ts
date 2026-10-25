import { describe, expect, it } from 'vitest';
import { resolveWorkspaceRoute } from './cbt-routing';
import { createAttempt, submitAttempt, type TestPaper } from './testing-model';
import { GUARDED_INTEGRITY_POLICY } from './cbt-integrity';

const paper: TestPaper = { id:'routing-test', title:'Routing test fixture', description:'', durationMinutes:10, createdAt:1000, updatedAt:1000, questions:[{ id:'q',prompt:'Question fixture',subject:'Subject',chapter:'',topic:'',difficulty:'Easy',kind:'single',options:['First','Second'],correctAnswers:[0],marks:1,negativeMarks:0,idealSeconds:30,explanation:'' }] };
const saved = (activeAttempt: unknown) => JSON.stringify({ version:1, activeAttempt });
describe('guarded attempt navigation recovery', () => {
  it('resumes guarded attempts regardless of saved route, including malformed hashes', () => {
    const attempt = createAttempt(paper, 1000, { integrityPolicy:{...GUARDED_INTEGRITY_POLICY} });
    expect(resolveWorkspaceRoute('#Study%20Chat', saved(attempt))).toBe('Test Centre');
    expect(resolveWorkspaceRoute('', saved(attempt))).toBe('Test Centre');
    expect(resolveWorkspaceRoute('#%bad', saved(attempt))).toBe('Test Centre');
  });
  it('leaves practice and submitted attempts free to navigate', () => {
    expect(resolveWorkspaceRoute('#Resource%20Vault', saved(createAttempt(paper,1000)))).toBe('Resource Vault');
    const attempt=createAttempt(paper,1000,{integrityPolicy:{...GUARDED_INTEGRITY_POLICY}});
    expect(resolveWorkspaceRoute('#Today',saved(submitAttempt(attempt,2000)))).toBe('Today');
  });
  it('handles unavailable or damaged storage and invalid hashes without trapping navigation', () => {
    expect(resolveWorkspaceRoute('',null)).toBe('Today');
    expect(resolveWorkspaceRoute('#%zz','broken json')).toBe('Today');
    expect(resolveWorkspaceRoute('#Inbox', saved({status:'running',integrity:{policy:{mode:'guarded'}}}))).toBe('Inbox');
  });
});
