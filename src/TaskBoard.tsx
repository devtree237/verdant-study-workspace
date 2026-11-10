import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { GripVertical, Plus } from 'lucide-react';
import { TaskCard } from './Tasks';
import type { TaskDraft } from './Tasks';
import type { Stage, Task } from './model';
import { useStore } from './store';
import { Flip, duration, gsap, useGSAP } from './ui';
import { COMPLETED_CAPACITY, completeTask, moveTaskToStage, undoTaskCompletion } from './task-history';
import type { CompletionUndo } from './task-history';
import { TaskShredder } from './TaskShredder';
import type { TaskArchiveVisual } from './TaskShredder';
import { CHAT_TASK_MIME, readChatTaskDrag } from './chat-task-cards';
import type { ChatTaskDrag } from './chat-task-cards';
import { applyChatTaskToBoard, undoChatTaskBoardAction } from './chat-task-actions';
import type { ChatTaskBoardResult } from './chat-task-actions';
const stages:Stage[]=['To study','In progress','Practicing','Completed'];
type BoardProps={tasks:Task[];group:'stage'|'priority';onAdd:(initial?:TaskDraft)=>void;onEdit:(task:Task)=>void;onLink:(type:'resource'|'mistake',id:string)=>void};
type ColumnData={columnId:string;stage?:Stage;priority?:number};

const boardCollision: CollisionDetection = args => {
 if (!args.pointerCoordinates) return closestCenter(args);
 const hits = pointerWithin(args);
 const card = hits.find(hit => hit.id !== hit.data?.droppableContainer.data.current?.columnId);
 return card ? [card] : hits;
};

function SortableTask({task,column,onEdit,onLink,onComplete,onStageChange}:{task:Task;column:ColumnData;onEdit:BoardProps['onEdit'];onLink:BoardProps['onLink'];onComplete:(task:Task)=>void;onStageChange:(task:Task,stage:Stage)=>void}){
 const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id:task.id,data:column});
 const style={transform:transform?`translate3d(${transform.x}px,${transform.y}px,0)`:undefined,transition,opacity:isDragging?.25:1};
 return <div ref={setNodeRef} style={style} className="board-sortable"><TaskCard task={task} board onEdit={onEdit} onLink={onLink} onComplete={onComplete} onStageChange={onStageChange} dragHandle={<button className="drag-handle" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Drag ${task.title}. Space to pick up; arrows to move; Space to drop.`}><GripVertical size={13}/></button>}/></div>;
}
function BoardColumn({title,tasks,column,number,dragging,onAdd,onEdit,onLink,onComplete,onStageChange,archive,onArchiveComplete,onExternalTaskDrop}:{title:string;tasks:Task[];column:ColumnData;number:number;dragging:boolean;onAdd:()=>void;onEdit:BoardProps['onEdit'];onLink:BoardProps['onLink'];onComplete:(task:Task)=>void;onStageChange:(task:Task,stage:Stage)=>void;archive?:TaskArchiveVisual;onArchiveComplete:(key:string)=>void;onExternalTaskDrop:(payload:ChatTaskDrag|null,target:ColumnData)=>void}){
 const {setNodeRef,over}=useDroppable({id:column.columnId,data:column});
 const [nativeOver,setNativeOver]=useState(false);
 useEffect(()=>{const clear=()=>setNativeOver(false);document.addEventListener('dragend',clear);window.addEventListener('blur',clear);return()=>{document.removeEventListener('dragend',clear);window.removeEventListener('blur',clear);};},[]);
 const blocked=nativeOver&&column.stage==='Completed';
 const highlighted=over?.data.current?.columnId===column.columnId||nativeOver&&!blocked;
 return <section ref={setNodeRef} data-column-id={column.columnId} className={`board-column smart-column${highlighted?' drop-target':''}${blocked?' drop-blocked':''}`} aria-label={`${title} task column`}
  onDragOver={event=>{if(dragging||!Array.from(event.dataTransfer.types).includes(CHAT_TASK_MIME))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='copy';setNativeOver(true);}}
  onDragLeave={event=>{const next=event.relatedTarget;if(!(next instanceof Node)||!event.currentTarget.contains(next))setNativeOver(false);}}
  onDrop={event=>{if(dragging||!Array.from(event.dataTransfer.types).includes(CHAT_TASK_MIME))return;event.preventDefault();event.stopPropagation();setNativeOver(false);onExternalTaskDrop(readChatTaskDrag(event.dataTransfer),column);}}>
  <header className="board-heading">
   <span className={`stage-dot stage-${number}`} aria-hidden="true"/>
   <h2 title={column.stage==='Completed'?`The newest ${COMPLETED_CAPACITY} completed tasks stay here. Older tasks are saved in History.`:undefined}>{title}</h2>
   <span className="board-count" aria-label={`${tasks.length} tasks`}>{tasks.length}</span>
  </header>
  <div className="board-stack">
   <SortableContext items={tasks.map(task=>task.id)} strategy={verticalListSortingStrategy}>
    {tasks.map(task=><SortableTask key={task.id} task={task} column={column} onEdit={onEdit} onLink={onLink} onComplete={onComplete} onStageChange={onStageChange}/>)}
   </SortableContext>
   {!tasks.length&&<p className="board-no-tasks">{column.stage==='Completed'?'Completed tasks land here.':'No tasks yet.'}</p>}
  </div>
  {archive&&<TaskShredder key={archive.key} item={archive} onComplete={onArchiveComplete}/>}
  {nativeOver&&<div className="board-drop-message" role="status">{blocked?'Choose an active column. Completed records stay in History.':'Drop saved task here. Completed tasks become follow-ups.'}</div>}
  <footer className="board-footer"><button className="board-add" aria-label={`Add task to ${title}`} onClick={onAdd}><Plus size={15}/><span>Add task</span></button></footer>
 </section>;
}
export function TaskBoard({tasks,group,onAdd,onEdit,onLink}:BoardProps){
 const {data,update,notify}=useStore(),root=useRef<HTMLDivElement>(null),busy=useRef(false);
 const [dragged,setDragged]=useState<Task|null>(null);
 const [archiveFrames,setArchiveFrames]=useState<TaskArchiveVisual[]>([]),[archiveNotice,setArchiveNotice]=useState('');
 const seenArchives=useRef(new Map(data.taskHistory.map(task=>[task.id,task.archivedAt]))),previousVisible=useRef(new Map<string,{task:Task;columnId:string;layout:'stage'|'priority'}>());
 const previousTaskSources=useRef({all:data.tasks,visible:tasks});
 const archiveComplete=useCallback((key:string)=>setArchiveFrames(current=>current.filter(frame=>frame.key!==key)),[]);
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
 const {contextSafe}=useGSAP({scope:root});
 const captureVisible=useCallback(()=>{
  const visible=new Map<string,{task:Task;columnId:string;layout:'stage'|'priority'}>(),board=root.current,box=board?.getBoundingClientRect();
  if(board&&box)for(const task of tasks.filter(task=>task.done||task.stage==='Completed')){
   const card=board.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"]`),column=card?.closest<HTMLElement>('[data-column-id]'),bounds=card?.getBoundingClientRect();
   if(!card||!column||!bounds||!bounds.width||!bounds.height||bounds.right<=box.left||bounds.left>=box.right||bounds.bottom<=0||bounds.top>=window.innerHeight)continue;
   visible.set(task.id,{task,columnId:column.dataset.columnId!,layout:group});
  }
  previousVisible.current=visible;
 },[tasks,group]);
 useEffect(()=>{window.addEventListener('scroll',captureVisible,{capture:true,passive:true});window.addEventListener('resize',captureVisible);return()=>{window.removeEventListener('scroll',captureVisible,true);window.removeEventListener('resize',captureVisible);};},[captureVisible]);
 useLayoutEffect(()=>{
  const history=new Map(data.taskHistory.map(task=>[task.id,task.archivedAt])),born:TaskArchiveVisual[]=[];
  const filterChanged=previousTaskSources.current.all===data.tasks&&previousTaskSources.current.visible!==tasks;
  previousTaskSources.current={all:data.tasks,visible:tasks};
  if(!document.hidden)for(const task of data.taskHistory){
   const previous=previousVisible.current.get(task.id);
   if(seenArchives.current.get(task.id)!==task.archivedAt&&previous&&previous.layout===group)born.push({key:task.id+'@'+task.archivedAt,taskId:task.id,title:task.title,subjectName:task.subjectName,archivedAt:task.archivedAt,columnId:previous.columnId,layout:group});
  }
  seenArchives.current=history;
  // Undo, route/filter changes and later edits cannot leave stale animation work.
  // Removing these snapshots never removes a task or its durable History entry.
  setArchiveFrames(current=>{
   const valid=current.filter(frame=>!filterChanged&&history.get(frame.taskId)===frame.archivedAt&&frame.layout===group),keys=new Set(valid.map(frame=>frame.key)),added=born.filter(frame=>!keys.has(frame.key));
   if(valid.length===current.length&&!added.length)return current;
   return [...valid,...added].slice(-8);
  });
  if(born.length)setArchiveNotice(`“${born[born.length-1].title}” is safely saved in History.`);
  captureVisible();
 },[data.taskHistory,data.tasks,tasks,group,captureVisible]);
 const morph=contextSafe((mutation:()=>void)=>{const state=Flip.getState(root.current?.querySelectorAll('.board-task')||[]);flushSync(mutation);Flip.from(state,{duration:duration(.38),ease:'power3.out',absolute:true,fade:true,onEnter:elements=>gsap.fromTo(elements,{y:16,opacity:0},{y:0,opacity:1,duration:duration(.32),clearProps:'transform,opacity'}),onLeave:elements=>gsap.to(elements,{opacity:0,scale:.96,y:12,duration:duration(.24),ease:'power3.inOut'})});});
 const finish=contextSafe((task:Task)=>{
  if(busy.current||task.done)return;busy.current=true;const before=document.querySelector('[data-history-badge]')?.textContent;
  try{
   let undo:CompletionUndo|undefined;
   // Commit synchronously; navigation may cancel every tween without losing work.
   morph(()=>update(state=>{const result=completeTask(state,task.id);undo=result.undo;return result.state;}));
   if(!undo)return;
   notify('Task completed. Older completed tasks are safe in History.',()=>{if(undo)update(state=>undoTaskCompletion(state,undo!));});
   const element=root.current?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"]`);
   gsap.fromTo(element?.querySelector('.task-checkbox')||[],{scale:1.25,boxShadow:'0 0 0 6px #7c5cff20'},{scale:1,boxShadow:'0 0 0 0px #7c5cff00',duration:duration(.18),ease:'back.out(2)',clearProps:'transform,boxShadow'});
   const badge=document.querySelector('[data-history-badge]');if(badge&&badge.textContent!==before)gsap.fromTo(badge,{scale:1.35,backgroundColor:'#7c5cff'},{scale:1,duration:duration(.4),ease:'elastic.out(1,.5)',clearProps:'transform,backgroundColor'});
  }finally{busy.current=false;}
 });
 const stage=(task:Task,next:Stage)=>{if(next==='Completed'&&!task.done)finish(task);else morph(()=>update(state=>moveTaskToStage(state,task.id,next)));};
 const externalTaskDrop=contextSafe((payload:ChatTaskDrag|null,target:ColumnData)=>{
  if(busy.current){notify('Finish the current task action, then drop this card again.');return;}
  if(!payload){notify('This task card could not be read. Drag a saved task card from Study Chat.');return;}
  try{
   let result:ChatTaskBoardResult|undefined;
   morph(()=>update(state=>{result=applyChatTaskToBoard(state,payload,target);return result.state;}));
   if(result){const applied=result;notify(applied.message,applied.undo?()=>morph(()=>update(state=>undoChatTaskBoardAction(state,applied.undo!))):undefined);}
  }catch(error){notify(error instanceof Error?error.message:'The saved task could not be moved. Its stored records are unchanged.');}
 });
 function drop({active,over}:DragEndEvent){
  setDragged(null);
  if(!over||active.id===over.id)return;
  const task=tasks.find(item=>item.id===active.id),target=over.data.current as ColumnData|undefined;
  if(!task||!target)return;
  if(target.stage==='Completed'){
   if(!task.done)finish(task);
   return;
  }
  morph(()=>update(state=>{
   const nextStage=target.stage&&target.stage!==task.stage?moveTaskToStage(state,task.id,target.stage):state;
   const priority=target.priority;
   const next=priority&&task.priority!==priority?nextStage.tasks.map(item=>item.id===task.id?{...item,priority}:item):nextStage.tasks;
   const from=next.findIndex(item=>item.id===task.id),to=next.findIndex(item=>item.id===over.id);
   if(from>=0&&to>=0)return {...nextStage,tasks:arrayMove(next,from,to)};
   return next===nextStage.tasks?nextStage:{...nextStage,tasks:next};
  }));
 }
 return <DndContext sensors={sensors} collisionDetection={boardCollision} onDragStart={event=>setDragged(tasks.find(task=>task.id===event.active.id)||null)} onDragEnd={drop} onDragCancel={()=>setDragged(null)} accessibility={{screenReaderInstructions:{draggable:'Press Space to pick up a task, arrow keys to move between tasks and columns, Space to drop, or Escape to cancel.'}}}>
  <div ref={root} className="kanban smart-board">{stages.map((stageName,index)=>{const title=group==='priority'?`Priority ${index+1}`:stageName,column:ColumnData={columnId:`column-${index}`,...(group==='priority'?{priority:index+1}:{stage:stageName})};const items=tasks.filter(task=>group==='priority'?task.priority===index+1:task.stage===stageName).sort((a,b)=>stageName==='Completed'&&group==='stage'?(Date.parse(b.completedAt||'')||0)-(Date.parse(a.completedAt||'')||0):0);return <BoardColumn key={`${group}-${index}`} title={title} tasks={items} column={column} number={index} dragging={!!dragged} onAdd={()=>onAdd(group==='priority'?{priority:index+1}:{stage:stageName})} onEdit={onEdit} onLink={onLink} onComplete={finish} onStageChange={stage} archive={archiveFrames[0]?.columnId===column.columnId?archiveFrames[0]:undefined} onArchiveComplete={archiveComplete} onExternalTaskDrop={externalTaskDrop}/>;})}</div>
  <span className="board-archive-announcement" role="status" aria-live="polite" aria-atomic="true">{archiveNotice}</span>
  {createPortal(<DragOverlay zIndex={45}>{dragged&&<div className="task-drag-preview" data-priority={dragged.priority} aria-hidden="true"><span className="board-priority"/><strong>{dragged.title}</strong>{dragged.notes.trim()&&<p className="board-task-notes">{dragged.notes}</p>}</div>}</DragOverlay>,document.body)}
 </DndContext>;
}
