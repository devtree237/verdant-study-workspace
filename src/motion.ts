import type { RefObject } from 'react';
import { gsap, useGSAP, duration } from './ui';

/** One scoped motion system for every workspace surface and control. */
export function useWorkspaceMotion(scope:RefObject<HTMLDivElement|null>) {
 useGSAP((_context,contextSafe)=>{
   if(!scope.current||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
   const root=scope.current;
   gsap.fromTo(root.querySelectorAll('.sidebar-brand,.workspace-name,.quick-add,.nav-item,.subject-nav,.sidebar-bottom'),{opacity:0,x:-8},{opacity:1,x:0,duration:.4,stagger:.025,ease:'power3.out',clearProps:'opacity,transform'});
   const cardSelector='.task-card,.mistake-card,.folder-card,.resource-row,.label-card,.analytics-panel,.empty-state,.question-editor,.sidebar-folder-tree,.subject-subnav';
   const seen=new WeakSet<Element>();
   const reveal=contextSafe!((nodes:Element[])=>{
     const fresh=nodes.filter(node=>!seen.has(node)&&node.getClientRects().length);
     fresh.forEach(node=>seen.add(node));
     if(fresh.length)gsap.fromTo(fresh,{opacity:0},{opacity:1,duration:duration(.35),stagger:.025,ease:'power2.out',clearProps:'opacity'});
   });
   reveal(Array.from(root.querySelectorAll(cardSelector)));
   const observer=new MutationObserver(contextSafe!((mutations:MutationRecord[])=>{
     const added:Element[]=[];
     for(const mutation of mutations)for(const node of mutation.addedNodes){if(node instanceof Element){if(node.matches(cardSelector))added.push(node);added.push(...node.querySelectorAll(cardSelector));}}
     reveal(added);
   }));
   observer.observe(root,{childList:true,subtree:true});
   const over=contextSafe!((event:PointerEvent)=>{
     const card=(event.target as Element).closest<HTMLElement>('.folder-card,.mistake-card,.label-card,.resource-row');
     if(card&&!card.contains(event.relatedTarget as Node))gsap.to(card,{boxShadow:'0 4px 20px -2px rgba(16,185,129,0.08)',duration:.18,overwrite:'auto'});
   });
   const out=contextSafe!((event:PointerEvent)=>{const card=(event.target as Element).closest<HTMLElement>('.folder-card,.mistake-card,.label-card,.resource-row');if(card&&!card.contains(event.relatedTarget as Node))gsap.to(card,{boxShadow:'0 0 0 rgba(16,185,129,0)',duration:.22,overwrite:'auto'});});
   const press=contextSafe!((event:Event)=>{const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button||button.disabled||button.classList.contains('task-checkbox'))return;gsap.fromTo(button,{scale:.96},{scale:1,duration:.35,ease:'back.out(2)',clearProps:'transform',overwrite:'auto'});});
   const focus=contextSafe!((event:FocusEvent)=>{const input=event.target as HTMLElement;if(input.matches('input:not([type=checkbox]),textarea,select'))gsap.fromTo(input,{boxShadow:'0 0 0 0px rgba(5,150,105,0)'},{boxShadow:'0 0 0 3px rgba(5,150,105,0.07)',duration:.2});});
   const blur=contextSafe!((event:FocusEvent)=>{const input=event.target as HTMLElement;if(input.matches('input,textarea,select'))gsap.to(input,{boxShadow:'0 0 0 0px rgba(5,150,105,0)',duration:.2,clearProps:'boxShadow'});});
   const disclosure=contextSafe!((event:Event)=>{const details=event.target as HTMLDetailsElement;if(details.open&&details.matches('details'))gsap.fromTo(Array.from(details.children).slice(1),{opacity:0,y:6},{opacity:1,y:0,duration:.3,stagger:.02,ease:'power2.out',clearProps:'opacity,transform'});});
   root.addEventListener('pointerover',over);root.addEventListener('pointerout',out);root.addEventListener('click',press);root.addEventListener('focusin',focus);root.addEventListener('focusout',blur);root.addEventListener('toggle',disclosure,true);
   return()=>{observer.disconnect();root.removeEventListener('pointerover',over);root.removeEventListener('pointerout',out);root.removeEventListener('click',press);root.removeEventListener('focusin',focus);root.removeEventListener('focusout',blur);root.removeEventListener('toggle',disclosure,true);};
 },{scope});
}
