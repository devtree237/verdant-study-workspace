// Adapted from the user's ThoughtLine reference using Verdant's GSAP/Lucide stack.
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, CircleAlert, Sparkles } from 'lucide-react';
import { duration, gsap, useGSAP } from '../../ui';
import './ThoughtLine.css';

export function ThoughtLine({ working, label = 'Waiting for response', doneLabel = 'Response received', steps = [], failed = false }: {
 working: boolean; label?: string; doneLabel?: string; steps?: string[]; failed?: boolean;
}) {
 const [open, setOpen] = useState(true);
 const root = useRef<HTMLDivElement>(null), glyph = useRef<HTMLSpanElement>(null), timer = useRef<HTMLSpanElement>(null);
 const started = useRef<number | null>(null), elapsed = useRef(0);
 useEffect(() => {
  setOpen(working);
  if (!working) return;
  started.current = performance.now(); elapsed.current = 0;
  const paint = () => {
   elapsed.current = Math.max(0, (performance.now() - (started.current || performance.now())) / 1000);
   if (timer.current) timer.current.textContent = elapsed.current < 60 ? `${elapsed.current.toFixed(1)}s` : `${Math.floor(elapsed.current / 60)}m ${Math.floor(elapsed.current % 60)}s`;
  };
  paint(); const interval = window.setInterval(paint, 100);
  return () => window.clearInterval(interval);
 }, [working]);
 useGSAP(() => {
  const preference=gsap.matchMedia();
  preference.add('(prefers-reduced-motion: no-preference)',()=>{
   if (working) gsap.fromTo(glyph.current, { opacity: .55 }, { opacity: 1, duration: .8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
   else gsap.to(glyph.current, { opacity: .55, duration: duration(.35), ease: 'power3.out' });
  });
  return()=>preference.revert();
 }, { scope: root, dependencies: [working], revertOnUpdate: true });
 useGSAP(() => { if (open) gsap.fromTo('.thought-line__step', { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: duration(.22), stagger: .045, clearProps: 'opacity,transform', ease: 'power3.out' }); }, { scope: root, dependencies: [open, steps.join('|')], revertOnUpdate: true });
 const head = <><span ref={glyph} className="thought-line__glyph" aria-hidden="true"><Sparkles /></span><span className="thought-line__label" aria-hidden="true"><span className="thought-line__text" data-active={working ? '' : undefined}><span className="thought-line__breath" data-shimmer="">{label}</span></span><span className="thought-line__text thought-line__text--done" data-active={!working ? '' : undefined}>{doneLabel}</span></span><span ref={timer} className="thought-line__timer" data-done={!working ? '' : undefined} aria-hidden="true">0.0s</span>{steps.length > 0 && <span className="thought-line__chevron" data-on="" aria-hidden="true"><ChevronDown size={13} /></span>}<span className="thought-line__sr" role="status">{working ? label : doneLabel}</span></>;
 return <div className="thought-line" ref={root} data-working={working ? '' : undefined} data-open={open && steps.length ? '' : undefined}>
  {steps.length ? <button type="button" className="thought-line__head" data-toggle="" aria-label={working ? 'Show request status' : doneLabel + ' · show request status'} aria-expanded={open} onClick={() => setOpen(value => !value)}>{head}</button> : <div className="thought-line__head">{head}</div>}
  {steps.length > 0 && <div className="thought-line__trace" data-open={open ? '' : undefined} aria-hidden={!open}><div className="thought-line__fold"><div className="thought-line__steps">{steps.map((step, index) => { const done = index < steps.length - 1 || (!working && !failed); return <div className="thought-line__step" key={step} data-done={done ? '' : undefined}><span className="thought-line__mark" aria-hidden="true">{done ? <Check size={12} /> : failed ? <CircleAlert size={12} /> : <i className="thought-line__pulse" />}</span><span className="thought-line__step-text">{step}</span></div>; })}</div></div></div>}
 </div>;
}
