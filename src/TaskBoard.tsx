import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import useEmblaCarousel from 'embla-carousel-react';
import { Observer } from 'gsap/Observer';
import { ChevronDown, ChevronUp, GripVertical, Plus } from 'lucide-react';
import { TaskCard } from './Tasks';
import type { TaskDraft } from './Tasks';
import type { Stage, Task } from './model';
import { useStore } from './store';
import { Flip, duration, gsap, useGSAP } from './ui';
import { completeTask, moveTaskToStage, undoTaskCompletion } from './task-history';
import type { CompletionUndo } from './task-history';
gsap.registerPlugin(Observer);
const stages:Stage[]=['To study','In progress','Practicing','Completed'];
type BoardProps={tasks:Task[];group:'stage'|'priority';onAdd:(initial?:TaskDraft)=>void;onEdit:(task:Task)=>void;onLink:(type:'resource'|'mistake',id:string)=>void};
type ColumnData={columnId:string;stage?:Stage;priority?:number};

function SortableTask({task,column,visible,onEdit,onLink,onComplete,onStageChange}:{task:Task;column:ColumnData;visible:boolean;onEdit:BoardProps['onEdit'];onLink:BoardProps['onLink'];onComplete:(task:Task)=>void;onStageChange:(task:Task,stage:Stage)=>void}){
 const {attributes,listeners,setNodeRef,setActivatorNodeRef,transform,transition,isDragging}=useSortable({id:task.id,disabled:!visible,data:column});
 const style={transform:transform?`translate3d(${transform.x}px,${transform.y}px,0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`:undefined,transition,opacity:isDragging?.18:1};
 return <div ref={setNodeRef} style={style} className="board-sortable"><TaskCard task={task} board onEdit={onEdit} onLink={onLink} onComplete={onComplete} onStageChange={onStageChange} dragHandle={<button className="drag-handle" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Drag ${task.title}. Space to pick up; arrows to move; Space to drop.`}><GripVertical size={13}/></button>}/></div>;
}
function BoardColumn({title,tasks,column,number,dragging,onAdd,onEdit,onLink,onComplete,onStageChange}:{title:string;tasks:Task[];column:ColumnData;number:number;dragging:boolean;onAdd:()=>void;onEdit:BoardProps['onEdit'];onLink:BoardProps['onLink'];onComplete:(task:Task)=>void;onStageChange:(task:Task,stage:Stage)=>void}){
 const {setNodeRef,isOver}=useDroppable({id:column.columnId,data:column});
 const [emblaRef,api]=useEmblaCarousel({axis:'y',align:'start',loop:false,watchDrag:false,duration:0,containScroll:'trimSnaps'});
 const [page,setPage]=useState(0),panel=useRef<HTMLElement>(null),viewport=useRef<HTMLDivElement>(null),moving=useRef(false),pageRef=useRef(0);
 const pages=Array.from({length:Math.max(1,Math.ceil(tasks.length/4))},(_,index)=>tasks.slice(index*4,index*4+4));
 const {contextSafe}=useGSAP({scope:panel});
 const go=contextSafe((target:number)=>{
  const next=Math.max(0,Math.min(pages.length-1,target));if(next===pageRef.current||moving.current||dragging)return;
  moving.current=true;const direction=next>pageRef.current?1:-1,current=panel.current?.querySelectorAll(`[data-page="${pageRef.current}"] .board-task`);
  gsap.to(current||[],{y:direction*-28,opacity:0,scale:.96,duration:duration(.24),stagger:duration(.03),ease:'power2.in',onComplete:()=>{
   gsap.set(current||[],{clearProps:'transform,opacity'});pageRef.current=next;flushSync(()=>setPage(next));api?.scrollTo(next,true);
   const incoming=panel.current?.querySelectorAll(`[data-page="${next}"] .board-task`);
   gsap.fromTo(incoming||[],{y:direction*32,opacity:0,scale:.96},{y:0,opacity:1,scale:1,duration:duration(.36),stagger:duration(.045),ease:'power3.out',clearProps:'transform,opacity',onComplete:()=>{moving.current=false;}});
  }});
 });
 useEffect(()=>{if(!api)return;const selected=()=>{pageRef.current=api.selectedScrollSnap();setPage(pageRef.current);};api.on('select',selected);return()=>{api.off('select',selected);};},[api]);
 useLayoutEffect(()=>{const clamped=Math.min(pageRef.current,pages.length-1);pageRef.current=clamped;setPage(clamped);api?.reInit();api?.scrollTo(clamped,true);},[api,tasks.map(task=>task.id).join(',')]);
 useGSAP(()=>{
  const target=viewport.current;if(!target)return;let last=0;
  const observer=Observer.create({target,type:'wheel',preventDefault:true,tolerance:25,onChangeY:self=>{if(Date.now()-last<550||dragging)return;last=Date.now();go(pageRef.current+(self.deltaY>0?1:-1));}});
  return()=>observer.kill();
 },{scope:panel,dependencies:[api,pages.length,dragging],revertOnUpdate:true});
 const setViewport=useCallback((element:HTMLDivElement|null)=>{viewport.current=element;emblaRef(element);},[emblaRef]);
 return <section ref={element=>{panel.current=element;setNodeRef(element);}} className={`board-column smart-column ${isOver?'drop-target':''}`} aria-label={`${title} task column`}>
  <header className="board-heading"><span className={`stage-dot stage-${number}`}/><h2>{title}</h2><span>{tasks.length}</span></header>
  <div className="board-pages" ref={setViewport} tabIndex={0} role="region" aria-label={`${title} pages. Use Up and Down arrows to change pages.`} onKeyDown={event=>{if(event.target!==event.currentTarget||dragging)return;const next=event.key==='ArrowDown'?page+1:event.key==='ArrowUp'?page-1:event.key==='Home'?0:event.key==='End'?pages.length-1:null;if(next!==null){event.preventDefault();go(next);}}}>
   <div className="board-page-track">{pages.map((items,index)=><div className="board-page" data-page={index} key={index} inert={index!==page} aria-hidden={index!==page}><SortableContext items={items.map(task=>task.id)} strategy={verticalListSortingStrategy}>{items.map(task=><SortableTask key={task.id} task={task} column={column} visible={index===page} onEdit={onEdit} onLink={onLink} onComplete={onComplete} onStageChange={onStageChange}/>)}</SortableContext>{!items.length&&<div className="board-no-tasks">{title==='Completed'?'Completed tasks land here.':'Room for your next step.'}</div>}</div>)}</div>
  </div>
  {page<pages.length-1&&<span className="board-stack-lip" aria-hidden="true"/>}
  <footer className="board-pagination"><button className="board-add" aria-label={`Add task to ${title}`} onClick={onAdd}><Plus size={13}/><span>Add task</span></button><div><button aria-label={`Previous ${title} task page`} disabled={page===0||dragging} onClick={()=>go(page-1)}><ChevronUp size={13}/></button><span role="status">{page+1} / {pages.length}</span><button aria-label={`Next ${title} task page`} disabled={page===pages.length-1||dragging} onClick={()=>go(page+1)}><ChevronDown size={13}/></button></div></footer>
 </section>;
}
export function TaskBoard({tasks,group,onAdd,onEdit,onLink}:BoardProps){
 const {update,notify}=useStore(),root=useRef<HTMLDivElement>(null),busy=useRef(false);
 const [dragged,setDragged]=useState<Task|null>(null);
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
 const {contextSafe}=useGSAP({scope:root});
 useLayoutEffect(()=>{const resize=()=>{if(root.current)root.current.style.setProperty('--board-fit-height',`${Math.max(270,window.innerHeight-root.current.getBoundingClientRect().top-24)}px`);};resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 const morph=contextSafe((mutation:()=>void)=>{const state=Flip.getState(root.current?.querySelectorAll('.board-page:not([aria-hidden=true]) .task-card')||[]);flushSync(mutation);Flip.from(state,{duration:duration(.38),stagger:duration(.04),ease:'power3.out',absolute:true,fade:true,onEnter:elements=>gsap.fromTo(elements,{y:24,opacity:0},{y:0,opacity:1,duration:duration(.38),clearProps:'transform,opacity'}),onLeave:elements=>gsap.to(elements,{opacity:0,scale:.88,y:18,filter:'blur(3px)',duration:duration(.32),ease:'power3.inOut'})});});
 const finish=contextSafe((task:Task)=>{
  if(busy.current||task.done)return;busy.current=true;const element=root.current?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"]`),before=document.querySelector('[data-history-badge]')?.textContent;
  gsap.timeline({onComplete:()=>{let undo:CompletionUndo|undefined;morph(()=>update(state=>{const result=completeTask(state,task.id);undo=result.undo;return result.state;}));notify('Task completed. Older completed tasks are safe in History.',()=>{if(undo)update(state=>undoTaskCompletion(state,undo!));});busy.current=false;const badge=document.querySelector('[data-history-badge]');if(badge&&badge.textContent!==before)gsap.fromTo(badge,{scale:1.35,backgroundColor:'#7c5cff'},{scale:1,duration:duration(.4),ease:'elastic.out(1,.5)',clearProps:'transform,backgroundColor'});}}).fromTo(element?.querySelector('.task-checkbox')||[],{scale:1.25,boxShadow:'0 0 0 6px #7c5cff20'},{scale:1,boxShadow:'0 0 0 0px #7c5cff00',duration:duration(.18),ease:'back.out(2)'}).to(element||[],{x:24,scale:.92,opacity:0,duration:duration(.25),ease:'power2.in'}).set(element||[],{clearProps:'transform,opacity'});
 });
 const stage=(task:Task,next:Stage)=>{if(next==='Completed'&&!task.done)finish(task);else morph(()=>update(state=>moveTaskToStage(state,task.id,next)));};
 function drop(event:DragEndEvent){setDragged(null);if(!event.over)return;const task=tasks.find(item=>item.id===String(event.active.id)),target=event.over.data.current as ColumnData|undefined;if(!task||!target)return;
  if(target.stage&&target.stage!==task.stage){stage(task,target.stage);return;}
  morph(()=>update(state=>{let next=state.tasks;if(target.priority&&task.priority!==target.priority)next=next.map(item=>item.id===task.id?{...item,priority:target.priority!}:item);const from=next.findIndex(item=>item.id===task.id),to=next.findIndex(item=>item.id===String(event.over!.id));return {...state,tasks:to>=0&&from>=0?arrayMove(next,from,to):next};}));
 }
 return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={event=>setDragged(tasks.find(task=>task.id===event.active.id)||null)} onDragEnd={drop} onDragCancel={()=>setDragged(null)} accessibility={{screenReaderInstructions:{draggable:'Press Space to pick up a task, arrow keys to move between tasks and columns, Space to drop, or Escape to cancel.'}}}>
  <div ref={root} className="kanban smart-board">{stages.map((stageName,index)=>{const title=group==='priority'?`Priority ${index+1}`:stageName,column:ColumnData={columnId:`column-${index}`,...(group==='priority'?{priority:index+1}:{stage:stageName})};const items=tasks.filter(task=>group==='priority'?task.priority===index+1:task.stage===stageName).sort((a,b)=>stageName==='Completed'&&group==='stage'?(Date.parse(b.completedAt||'')||0)-(Date.parse(a.completedAt||'')||0):0);return <BoardColumn key={`${group}-${index}`} title={title} tasks={items} column={column} number={index} dragging={!!dragged} onAdd={()=>onAdd(group==='priority'?{priority:index+1}:{stage:stageName})} onEdit={onEdit} onLink={onLink} onComplete={finish} onStageChange={stage}/>;})}</div>
  <DragOverlay>{dragged&&<div className="task-drag-preview"><GripVertical size={14}/>{dragged.title}</div>}</DragOverlay>
 </DndContext>;
}
