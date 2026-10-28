import { describe, expect, it } from 'vitest';
import { applyQuestionGroups, assertWorkspaceGroupSubjects, assignQuestionRange, createQuestionGroups, inferPaperMarking, questionGroupsNeedApply, getPaperSections } from './test-authoring';
import type { TestQuestion, TestQuestionGroup } from './testing-model';
const question=(id:string,patch:Partial<TestQuestion>={}):TestQuestion=>({id,prompt:'Authored question',subject:'Physics',chapter:'Existing chapter',topic:'Existing topic',difficulty:'Moderate',kind:'single',options:['First authored option','Second authored option'],correctAnswers:[1],marks:4,negativeMarks:1,idealSeconds:120,explanation:'Supplied explanation',...patch});
const group=(id:string,questionIds:string[],patch:Partial<TestQuestionGroup>={}):TestQuestionGroup=>({id,name:'Authored group',questionIds,subject:'Physics',kind:'single',...patch});
describe('group-based paper authoring',()=>{
 it('does not demand reapplying settings for renamed groups or compatible new membership',()=>{
  const questions=[question('1'),question('2')],groups=[group('a',['1','2'],{name:'Renamed section'})];
  expect(questionGroupsNeedApply(questions,groups,{marks:4,negativeMarks:1})).toBe(false);
  expect(questionGroupsNeedApply(questions,[group('a',['1','2'],{kind:'multiple'})],{marks:4,negativeMarks:1})).toBe(true);
  expect(questionGroupsNeedApply(questions,[group('a',['1']),group('b',['1','2'])],{marks:4,negativeMarks:1})).toBe(true);
 });
 it('uses stored groups for runtime sections, with subject sections for legacy papers',()=>{
  const questions=[question('1'),question('2')],paper={id:'paper',title:'Authored paper',description:'',questions,durationMinutes:60,createdAt:0,updatedAt:0};
  expect(getPaperSections({...paper,groups:[group('a',['1']),group('b',['2'])]}).map(section=>section.questions.map(question=>question.id))).toEqual([['1'],['2']]);
  expect(getPaperSections(paper).map(section=>section.questions.length)).toEqual([2]);
 });
 it('detects mixed legacy scores without changing the original questions',()=>{
  const questions=[question('1'),question('2',{marks:2,negativeMarks:0})],before=structuredClone(questions);
  expect(inferPaperMarking(questions)).toEqual({marking:{marks:4,negativeMarks:1},mixed:true});expect(questions).toEqual(before);
 });
 it('preserves valid canonical groups and gives unmatched contiguous subjects/types their own groups',()=>{
  const questions=[question('1'),question('2'),question('3',{subject:'Chemistry'}),question('4',{subject:'Chemistry',kind:'numeric',options:[],correctAnswers:[],numericAnswer:5})];
  const groups=createQuestionGroups(questions,[group('kept',['1'])]);
  expect(groups[0]).toEqual(group('kept',['1']));expect(groups.map(item=>item.questionIds)).toEqual([['1'],['2'],['3'],['4']]);
  expect(new Set(groups.flatMap(item=>item.questionIds)).size).toBe(4);
 });
 it('reassigns a range exclusively without dropping or duplicating any question',()=>{
  const questions=[question('1'),question('2'),question('3'),question('4')],groups=[group('a',['1','2','3']),group('b',['4'])];
  const result=assignQuestionRange(questions,groups,'b',2,3);
  expect(result.map(item=>item.questionIds)).toEqual([['1'],['2','3','4']]);expect(groups[0].questionIds).toEqual(['1','2','3']);
  expect(()=>assignQuestionRange(questions,groups,'b',0,8)).toThrow(/range/);
 });
 it('uses one decided score for every group, preserving the authored content and source metadata',()=>{
  const questions=[{...question('1'),sourceNumber:'16',sourcePage:3},{...question('2',{marks:2}),sourceNumber:'17',sourcePage:3}];
  const result=applyQuestionGroups(questions,[group('a',['1']),group('b',['2'],{subject:'Chemistry',kind:'multiple'})],{marks:3,negativeMarks:.5});
  expect(result.map(item=>[item.marks,item.negativeMarks])).toEqual([[3,.5],[3,.5]]);expect(result[1]).toMatchObject({subject:'Chemistry',kind:'multiple',correctAnswers:[1],sourceNumber:'17',sourcePage:3,topic:'Existing topic'});
  expect(questions[1].marks).toBe(2);
 });
 it('clears incompatible keys and stale source labels when changing numeric/choice families',()=>{
  const source={...question('1'),sourceOptionLabels:['A','B'],sourceNumber:'1'};
  const numeric=applyQuestionGroups([source],[group('a',['1'],{kind:'numeric'})],{marks:4,negativeMarks:1})[0];
  expect(numeric).toMatchObject({kind:'numeric',options:[],correctAnswers:[],numericAnswer:undefined,sourceOptionLabels:undefined,sourceNumber:'1'});
  const back=applyQuestionGroups([numeric],[group('a',['1'])],{marks:4,negativeMarks:1})[0];
  expect(back.options).toEqual(['','','','']);expect(back.correctAnswers).toEqual([]);expect(back.sourceOptionLabels).toBeUndefined();
 });
 it('keeps a compatible sole choice but clears a multiple key when converted to single correct',()=>{
  const result=applyQuestionGroups([question('1',{kind:'multiple',correctAnswers:[0,1]}),question('2',{kind:'multiple',correctAnswers:[1]})],[group('a',['1','2'])],{marks:4,negativeMarks:1});
  expect(result[0].correctAnswers).toEqual([]);expect(result[1].correctAnswers).toEqual([1]);
 });
 it('rejects unknown workspace subjects, duplicate membership, ungrouped questions and invalid scores',()=>{
  expect(()=>assertWorkspaceGroupSubjects([group('a',['1'],{subject:'Uncreated subject'})],['Physics'])).toThrow(/existing workspace subject/);
  expect(()=>applyQuestionGroups([question('1')],[group('a',['1']),group('b',['1'])],{marks:4,negativeMarks:1})).toThrow(/exactly one/);
  expect(()=>applyQuestionGroups([question('1')],[],{marks:4,negativeMarks:1})).toThrow(/Assign every/);
  expect(()=>applyQuestionGroups([question('1')],[group('a',['1'])],{marks:0,negativeMarks:1})).toThrow(/positive/);
 });
});
