import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Flip } from 'gsap/Flip';
import { Draggable } from 'gsap/Draggable';
import { CustomEase } from 'gsap/CustomEase';
import { X, Check, Leaf, ArrowUpRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import './markdown-tables.css';
import './scientific-notation.css';
import { normalizeScientificMarkdown } from './scientific-notation';
import rehypeKatex from 'rehype-katex';
import 'katex/contrib/mhchem';
import { useStore } from './store';
gsap.registerPlugin(useGSAP,Flip,Draggable,CustomEase);
CustomEase.create('botanical.out', '0.16,1,0.3,1');
CustomEase.create('botanical.soft', '0.4,0,0.2,1');
export { gsap, useGSAP, Flip, Draggable };
export const duration=(value:number)=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:value;
// A damped spring with the requested stiffness 320, damping 26 and mass .8.
const botanicalSpring=(progress:number)=>{
 if(progress===0||progress===1)return progress;
 const stiffness=320,damping=26,mass=.8,time=progress*.44;
 const decay=damping/(2*mass),frequency=Math.sqrt(stiffness/mass-decay*decay);
 return 1-Math.exp(-decay*time)*(Math.cos(frequency*time)+decay/frequency*Math.sin(frequency*time));
};
export const motion={fast:.12,state:.22,structural:.24,data:.8,count:.4,easeOut:'botanical.out',easeSoft:'botanical.soft',spring:botanicalSpring};
export function CountUp({value,suffix='',className=''}:{value:number;suffix?:string;className?:string}){
 const ref=useRef<HTMLSpanElement>(null);
 useGSAP(()=>{const count={value:0};const precision=Number.isInteger(value)?0:2;gsap.to(count,{value,duration:duration(motion.count),ease:motion.easeOut,onUpdate:()=>{if(ref.current)ref.current.textContent=`${Number(count.value.toFixed(precision))}${suffix}`;}});},{scope:ref,dependencies:[value,suffix],revertOnUpdate:true});
 return <span className={className} aria-label={`${Number(value.toFixed(Number.isInteger(value)?0:2))}${suffix}`} ref={ref}>{value}{suffix}</span>;
}
export function TimerDigits({value}:{value:string}){
 const ref=useRef<HTMLSpanElement>(null);const previous=useRef(value);
 useGSAP(()=>{if(previous.current===value)return;const changed=Array.from(ref.current?.querySelectorAll<HTMLElement>('.timer-digit-inner')||[]).filter((_,index)=>value[index]!==previous.current[index]&&value[index]!==':');gsap.fromTo(changed,{yPercent:-100,opacity:.5},{yPercent:0,opacity:1,duration:duration(.22),ease:motion.easeOut,clearProps:'transform,opacity'});previous.current=value;},{scope:ref,dependencies:[value]});
 return <span ref={ref} className="timer-digits" aria-label={value}>{Array.from(value).map((digit,index)=><span key={index} className={digit===':'?'timer-separator':'timer-digit'} aria-hidden="true"><span className="timer-digit-inner">{digit}</span></span>)}</span>;
}
export function Brand({small=false}:{small?:boolean}) {return <div className="flex items-center gap-2.5"><div className="brand-mark"><Leaf size={small?18:21} strokeWidth={2.1}/></div>{!small&&<span className="text-[23px] font-semibold tracking-[-1px]">verdant<span className="text-emerald-600">.</span></span>}</div>;}
export function Markdown({children}:{children:string}){return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[[rehypeKatex,{trust:false}]]} components={{table:({children,node:_node,...props})=><div className="markdown-table-scroll"><table {...props}>{children}</table></div>}}>{normalizeScientificMarkdown(children)}</ReactMarkdown></div>;}
export function SubjectBadge({id,dotOnly=false}:{id:string;dotOnly?:boolean}){const{data}=useStore();const s=data.subjects.find(x=>x.id===id);if(!s)return null;return <span className={`subject-badge tone-${s.color}`}><span className="subject-dot"/>{!dotOnly&&s.name}</span>;}
export function Progress({value,className=''}:{value:number;className?:string}){const ref=useRef<HTMLDivElement>(null);const bounded=Math.min(100,Math.max(0,value));useGSAP(()=>{gsap.fromTo(ref.current,{scaleX:0},{scaleX:bounded/100,duration:duration(motion.data),ease:motion.easeOut});},{scope:ref,dependencies:[bounded],revertOnUpdate:true});return <div className={`progress-track ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bounded)}><div ref={ref} className="progress-fill"/></div>;}
export function Gauge({value,size=100}:{value:number;size?:number}){const ref=useRef<HTMLDivElement>(null);const bounded=Math.min(100,Math.max(0,value));useGSAP(()=>{gsap.fromTo('.gauge-fill',{strokeDashoffset:264},{strokeDashoffset:264*(1-bounded/100),duration:duration(motion.data),ease:motion.easeOut});},{scope:ref,dependencies:[bounded],revertOnUpdate:true});return <div ref={ref} className="gauge" aria-label={`${bounded}% mastery`}><svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--accent-soft, #E8F0EC)" strokeWidth="7"/><circle className="gauge-fill" cx="50" cy="50" r="42" fill="none" stroke="var(--accent, #107C41)" strokeWidth="7" strokeLinecap="round" strokeDasharray="264" transform="rotate(-90 50 50)"/></svg><div><CountUp value={Math.round(bounded)}/><span className="text-[12px]">%</span></div></div>;}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
 const ref=useRef<HTMLDivElement>(null);const id=useId();const closeRef=useRef(onClose);closeRef.current=onClose;const closing=useRef(false);const dismissRef=useRef<()=>void>(()=>{});
 const {contextSafe}=useGSAP(()=>{gsap.fromTo('.modal-panel',{y:-24,scale:.96,opacity:0},{y:0,scale:1,opacity:1,duration:duration(.3),ease:'expo.out'});gsap.fromTo(ref.current,{opacity:0},{opacity:1,duration:duration(.2)});},{scope:ref});
 const close=contextSafe(()=>{if(closing.current)return;closing.current=true;gsap.to(ref.current,{opacity:0,duration:duration(.15),onComplete:()=>closeRef.current()});});dismissRef.current=close;
 useEffect(()=>{const previous=document.activeElement as HTMLElement;const old=document.body.style.overflow;document.body.style.overflow='hidden';const panel=ref.current;const focusables=()=>Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')||[]).filter(e=>e.offsetParent!==null);const input=panel?.querySelector<HTMLElement>('input,textarea,select');(input||focusables()[0])?.focus();const onKey=(e:KeyboardEvent)=>{if(e.defaultPrevented||!panel?.contains(e.target as Node)||Array.from(document.querySelectorAll('[role=dialog]')).at(-1)!==panel?.querySelector('[role=dialog]'))return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismissRef.current();}if(e.key==='Tab'){const items=focusables();const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',onKey);previous?.focus();};},[]);
 return <div className="modal-backdrop" ref={ref} onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section role="dialog" aria-modal="true" aria-labelledby={id} className={`modal-panel ${wide?'modal-wide':''}`}><header className="modal-header"><h2 id={id}>{title}</h2><button className="icon-btn" aria-label="Close dialog" onClick={close}><X size={19}/></button></header>{children}</section></div>;
}
export function Toast(){const{notice,dismiss}=useStore();const ref=useRef<HTMLDivElement>(null);useGSAP(()=>{if(notice)gsap.fromTo(ref.current,{y:30,opacity:0},{y:0,opacity:1,duration:duration(.35),ease:'power3.out'});},{scope:ref,dependencies:[notice?.id],revertOnUpdate:true});if(!notice)return null;return <div className="toast" ref={ref} role="status"><span className="toast-check"><Check size={15}/></span><span>{notice.message}</span>{notice.undo&&<button className="font-semibold text-emerald-300" onClick={()=>{notice.undo?.();dismiss();}}>Undo</button>}<button aria-label="Dismiss notification" onClick={dismiss}><X size={15}/></button></div>;}
export function Empty({title,description,action}:{title:string;description:string;action?:ReactNode}){return <div className="empty-state"><span className="empty-leaf" aria-hidden="true"><Leaf size={30}/></span><h3>{title}</h3><p>{description}</p>{action}</div>;}
export function SectionHeading({title,count,children}:{title:string;count?:number;children?:ReactNode}){return <div className="section-heading"><h2>{title}{count!==undefined&&<span>{count}</span>}</h2>{children}</div>;}
export function TextLink({children,onClick}:{children:ReactNode;onClick:()=>void}){return <button className="text-link" onClick={onClick}>{children}<ArrowUpRight size={14}/></button>;}
