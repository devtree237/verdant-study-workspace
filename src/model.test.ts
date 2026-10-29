import { describe,it,expect } from 'vitest';
import { parseTask,createEmptyState,day,reviewResult,linkedTask,migrateStoredState,rollUpMastery,validateWorkspaceState } from './model';
import type { Mistake,Subject } from './model';
// Fixtures are used only by the test runner; the application starts empty.
const subjects:Subject[]=[{id:'physics-user',name:'Physics',color:'orange'}];
describe('natural language quick add',()=>{
 const base=new Date(2026,9,16,12);
 it('extracts subject, labels, priority and tomorrow',()=>{expect(parseTask('Practice flux #Physics @pyq p1 tomorrow',subjects,base)).toEqual({title:'Practice flux',subject:'physics-user',labels:['pyq'],priority:1,due:'2026-10-17',recurring:false});});
 it('handles next Monday and daily recurrence',()=>{expect(parseTask('Revise next monday',subjects,base).due).toBe('2026-10-19');expect(parseTask('Read every day',subjects,base).recurring).toBe(true);});
 it('rolls next Monday forward a week when today is Monday',()=>{expect(parseTask('Revise next monday',subjects,new Date(2026,9,19,12)).due).toBe('2026-10-26');});
});
describe('real-data workspace',()=>{
 it('starts with no example content or activity',()=>{const s=createEmptyState();for(const key of ['tasks','subjects','mistakes','folders','resources','assessments','focusLog'] as const)expect(s[key]).toEqual([]);expect(s.focusMinutes).toBe(0);});
 it('migrates development examples without removing user-created tasks',()=>{const s=createEmptyState();s.version=1;const task=linkedTask('My actual reading','physics-user','resource','r2');s.tasks=[{...task,id:'t1'},{...task,id:'my-task'}];const migrated=migrateStoredState(s);expect(migrated.version).toBe(3);expect(migrated.tasks).toHaveLength(1);expect(migrated.tasks[0]).toMatchObject({id:'my-task',title:'My actual reading',link:undefined});});
 it('preserves current data during repeated hydration',()=>{const s=createEmptyState();s.tasks=[linkedTask('My notes','physics-user','resource','my-notes')];expect(migrateStoredState(s)).toBe(s);});
 it('calculates folder mastery from real nested resources',()=>{const folders=[{id:'root',name:'Subject',parent:null,subject:'s',pinned:false,mastery:0},{id:'child',name:'Chapter',parent:'root',subject:'s',pinned:false,mastery:0}];const resources=[{id:'one',title:'My note',folder:'child',subject:'s',type:'Note' as const,content:'My content',mastery:60,pinned:false,updated:day()},{id:'two',title:'My quiz',folder:'child',subject:'s',type:'Quiz' as const,content:'',mastery:100,pinned:false,updated:day()}];expect(rollUpMastery(folders,resources).map(f=>f.mastery)).toEqual([80,80]);});
});
describe('connected study workflows',()=>{
 it('schedules each recall result and increments attempts',()=>{const m:Mistake={id:'user-mistake',title:'My error',subject:'physics-user',topic:'My topic',category:'Conceptual gap',prompt:'My question',wrong:'My approach',solution:'My reasoning',takeaway:'My takeaway',difficulty:3,status:'Needs review',review:day(),attempts:0};expect(reviewResult(m,'failed').review).toBe(day(1));expect(reviewResult(m,'effort').review).toBe(day(3));expect(reviewResult(m,'mastered')).toMatchObject({review:day(14),status:'Mastered',attempts:1});});
 it('retains source identity on follow-up tasks',()=>{expect(linkedTask('Study notes','physics-user','resource','user-note')).toMatchObject({link:{type:'resource',id:'user-note'},due:day(),done:false});});
});


describe('mistake self-rated mastery persistence',()=>{
 const mistake:Mistake={id:'saved-mistake',title:'Saved question',subject:'s',topic:'',category:'Conceptual gap',prompt:'Question',wrong:'',solution:'Reasoning',takeaway:'',difficulty:4,status:'Needs review',review:day(),attempts:0};
 it('keeps an explicit mastery rating separate from difficulty through backup and recall',()=>{
  const state={...createEmptyState(),mistakes:[{...mistake,mastery:2}]};
  const restored=validateWorkspaceState(JSON.parse(JSON.stringify(state)));
  expect(restored.mistakes[0]).toMatchObject({mastery:2,difficulty:4});
  expect(reviewResult(restored.mistakes[0],'mastered')).toMatchObject({mastery:2,difficulty:4,status:'Mastered'});
  expect(validateWorkspaceState({...createEmptyState(),mistakes:[mistake]}).mistakes[0].mastery).toBeUndefined();
 });
 it('rejects corrupted mastery values rather than displaying a false rating',()=>{
  for(const mastery of [0,6,2.5,'5',null])expect(()=>validateWorkspaceState({...createEmptyState(),mistakes:[{...mistake,mastery}]})).toThrow('mastery');
 });
});
