import type { QuestionKind, TestPaper, TestQuestion, TestQuestionGroup } from './testing-model';
export function getPaperSections(paper:TestPaper,questions:TestQuestion[]=paper.questions):{id:string;name:string;subject:string;questions:TestQuestion[]}[]{
 if(paper.groups?.length)return paper.groups.map(group=>({id:group.id,name:group.name,subject:group.subject,questions:questions.filter(question=>group.questionIds.includes(question.id))}));
 return [...new Set(questions.map(question=>question.subject))].map(subject=>({id:subject,name:subject,subject,questions:questions.filter(question=>question.subject===subject)}));
}
export type PaperMarking = { marks:number; negativeMarks:number };
export function questionGroupsNeedApply(questions:TestQuestion[],groups:TestQuestionGroup[],marking:PaperMarking):boolean{
 const assignments=new Map<string,TestQuestionGroup[]>();for(const group of groups)for(const id of group.questionIds)assignments.set(id,[...(assignments.get(id)||[]),group]);
 return questions.some(question=>{const assigned=assignments.get(question.id)||[];return assigned.length!==1||assigned[0].subject!==question.subject||assigned[0].kind!==question.kind||question.marks!==marking.marks||question.negativeMarks!==marking.negativeMarks;});
}
export function assertPaperMarking(marking:PaperMarking):void{
 if(!Number.isFinite(marking.marks)||marking.marks<.001||marking.marks>100000||!Number.isFinite(marking.negativeMarks)||marking.negativeMarks<0||marking.negativeMarks>100000)throw new Error('Choose a positive correct-answer score and a non-negative wrong-answer penalty.');
}
export function inferPaperMarking(questions:TestQuestion[]):{marking:PaperMarking;mixed:boolean}{
 const marking={marks:questions[0]?.marks??4,negativeMarks:questions[0]?.negativeMarks??1};
 return {marking,mixed:questions.some(question=>question.marks!==marking.marks||question.negativeMarks!==marking.negativeMarks)};
}
/** Preserve canonical memberships, then group unmatched questions by their actual contiguous subject/type. */
export function createQuestionGroups(questions:TestQuestion[],groups?:TestQuestionGroup[]):TestQuestionGroup[]{
 const ids=new Set(questions.map(question=>question.id)),assigned=new Set<string>(),usedGroups=new Set<string>();
 const result=(groups||[]).map(group=>{const id=usedGroups.has(group.id)?crypto.randomUUID():group.id;usedGroups.add(id);return {...group,id,questionIds:group.questionIds.filter(questionId=>{if(!ids.has(questionId)||assigned.has(questionId))return false;assigned.add(questionId);return true;})};});
 let current:TestQuestionGroup|null=null;
 for(const question of questions){if(assigned.has(question.id)){current=null;continue;}if(!current||current.subject!==question.subject||current.kind!==question.kind){current={id:crypto.randomUUID(),name:`Group ${result.length+1}`,questionIds:[],subject:question.subject,kind:question.kind};result.push(current);}current.questionIds.push(question.id);assigned.add(question.id);}
 return result;
}
export function assignQuestionRange(questions:TestQuestion[],groups:TestQuestionGroup[],groupId:string,from:number,to:number):TestQuestionGroup[]{
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to>questions.length)throw new Error(`Choose a question range between 1 and ${questions.length}.`);
 if(!groups.some(group=>group.id===groupId))throw new Error('Choose an existing question group.');
 const selected=new Set(questions.slice(from-1,to).map(question=>question.id)),order=new Map(questions.map((question,index)=>[question.id,index]));
 return groups.map(group=>({...group,questionIds:(group.id===groupId?[...new Set([...group.questionIds,...selected])]:group.questionIds.filter(id=>!selected.has(id))).sort((a,b)=>(order.get(a)??0)-(order.get(b)??0))}));
}
export function assertWorkspaceGroupSubjects(groups:TestQuestionGroup[],subjectNames:string[]):void{
 const allowed=new Set(subjectNames);for(const group of groups.filter(group=>group.questionIds.length)){if(!group.name.trim())throw new Error('Give every question group a name.');if(!allowed.has(group.subject))throw new Error(`Choose an existing workspace subject for ${group.name}. Add missing subjects in the workspace first.`);}
}
function withKind<T extends TestQuestion>(question:T,kind:QuestionKind):T{
 if(question.kind===kind)return {...question};
 if(kind==='numeric')return {...question,kind,options:[],correctAnswers:[],numericAnswer:undefined,tolerance:0,sourceOptionLabels:undefined};
 if(question.kind==='numeric')return {...question,kind,options:['','','',''],correctAnswers:[],numericAnswer:undefined,tolerance:undefined,sourceOptionLabels:undefined};
 return {...question,kind,correctAnswers:kind==='single'&&question.correctAnswers.length!==1?[]:[...question.correctAnswers],numericAnswer:undefined,tolerance:undefined};
}
/** No per-question scoring exceptions; returned copies retain import source metadata. */
export function applyQuestionGroups<T extends TestQuestion>(questions:T[],groups:TestQuestionGroup[],marking:PaperMarking):T[]{
 assertPaperMarking(marking);
 const membership=new Map<string,TestQuestionGroup>();for(const group of groups)for(const id of group.questionIds){if(membership.has(id))throw new Error('Each question must belong to exactly one group.');membership.set(id,group);}
 return questions.map(question=>{const group=membership.get(question.id);if(!group)throw new Error('Assign every question to a group before saving.');return {...withKind(question,group.kind),subject:group.subject,marks:marking.marks,negativeMarks:marking.negativeMarks};});
}
