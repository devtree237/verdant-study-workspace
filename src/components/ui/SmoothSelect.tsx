import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { duration, gsap } from '../../ui';
import './smooth-select.css';

type Choice = { value: string; label: string; disabled: boolean; group?: string };
const text = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<{children?: ReactNode}>(child) ? text(child.props.children) : typeof child === 'string' || typeof child === 'number' ? String(child) : '').join('');
function choices(children: ReactNode, group?: string, disabled = false): Choice[] {
 const result: Choice[] = [];
 Children.forEach(children, child => {
  if (!isValidElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>(child)) return;
  if (child.type === 'option') { const label = child.props.label ?? text(child.props.children); result.push({value:String(child.props.value ?? label),label,disabled:disabled || !!child.props.disabled,group}); }
  else result.push(...choices(child.props.children, child.type === 'optgroup' ? child.props.label : group, disabled || !!child.props.disabled));
 });
 return result;
}

/** Native field semantics underneath an accessible, keyboard-operable animated popup. */
export function SmoothSelect({ children, value, defaultValue, className = '', style, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
 const id = useId(), native = useRef<HTMLSelectElement>(null), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
 const actions = useRef<Select.Root.Actions | null>(null), tween = useRef<gsap.core.Tween | null>(null), forwardingFocus = useRef(false);
 const [localValue, setLocalValue] = useState(String(defaultValue ?? value ?? '')), [label, setLabel] = useState(props['aria-label'] || ''), [open, setOpen] = useState(false);
 const options = choices(children), selected = String(value ?? localValue), rootId = props.id || id;
 useLayoutEffect(() => {
  const field = native.current;
  if (!field) return;
  if (value === undefined && !options.some(option => option.value === localValue) && field.value) setLocalValue(field.value);
  if (!props['aria-label']) {
   const parentLabel = field.labels?.[0] || Array.from(document.querySelectorAll('label')).find(node => node.htmlFor === rootId);
   if (parentLabel) { const clone = parentLabel.cloneNode(true) as HTMLElement; clone.querySelectorAll('.flow-select-shell').forEach(node => node.remove()); setLabel(clone.textContent?.trim() || 'Choose an option'); }
  }
 });
 useEffect(() => {
  const form = native.current?.form;
  if (!form || value !== undefined) return;
  const reset = () => { queueMicrotask(() => { if (native.current) setLocalValue(native.current.value); }); };
  form.addEventListener('reset', reset);
  return () => form.removeEventListener('reset', reset);
 }, [value]);
 useLayoutEffect(() => () => { tween.current?.kill(); if (popup.current) gsap.killTweensOf(popup.current.querySelectorAll('[role=option]')); }, []);
 if (props.multiple || (props.size && props.size > 1)) return <select {...props} value={value} defaultValue={defaultValue} className={className} style={style}>{children}</select>;
 return <span className="flow-select-shell" style={style}>
  <select {...props} id={`${rootId}-native`} ref={native} value={value} defaultValue={defaultValue} tabIndex={-1} aria-hidden="true" className={className} onFocus={event => {if(forwardingFocus.current)props.onFocus?.(event);else trigger.current?.focus();}} onBlur={event=>{if(forwardingFocus.current)props.onBlur?.(event);}} onMouseDown={event => event.preventDefault()} onClick={event => event.preventDefault()}>{children}</select>
  <Select.Root<string> value={options.some(option => option.value === selected) ? selected : options[0]?.value ?? ''} disabled={props.disabled} required={props.required} actionsRef={actions} modal={false} items={options} open={open} onOpenChange={(next, details) => {
   setOpen(next); tween.current?.kill();
   if (!next && popup.current) {
    details.preventUnmountOnClose();
    tween.current = gsap.to(popup.current, {opacity:0,y:-4,scale:.985,duration:duration(.14),ease:'power2.in',onComplete:()=>actions.current?.unmount()});
   }
  }} onValueChange={next => {
   if (next === null || !native.current) return;
   setLocalValue(next); native.current.value = next;
   native.current.dispatchEvent(new Event('change', {bubbles:true}));
  }}>
   <Select.Trigger ref={trigger} id={rootId} className="flow-select-trigger" aria-label={props['aria-label'] || label || 'Choose an option'} aria-labelledby={props['aria-labelledby']} aria-describedby={props['aria-describedby']} aria-invalid={props['aria-invalid']} aria-required={props.required} title={props.title} tabIndex={props.tabIndex}
    onFocus={event=>{forwardingFocus.current=true;native.current?.dispatchEvent(new FocusEvent('focusin',{bubbles:true,relatedTarget:event.relatedTarget}));forwardingFocus.current=false;}}
    onBlur={event=>{forwardingFocus.current=true;native.current?.dispatchEvent(new FocusEvent('focusout',{bubbles:true,relatedTarget:event.relatedTarget}));forwardingFocus.current=false;}}
    onKeyDown={event=>{if(!props.onKeyDown)return;const copy=new KeyboardEvent('keydown',{key:event.key,code:event.code,bubbles:true,cancelable:true,altKey:event.altKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey});native.current?.dispatchEvent(copy);if(copy.defaultPrevented)event.preventDefault();}}
    onKeyUp={event=>{if(props.onKeyUp)native.current?.dispatchEvent(new KeyboardEvent('keyup',{key:event.key,code:event.code,bubbles:true,cancelable:true}));}}>
    <Select.Value className="sr-only" /><Select.Icon className="flow-select-chevron"><ChevronDown size={13} /></Select.Icon>
   </Select.Trigger>
   <Select.Portal><Select.Positioner sideOffset={5} alignItemWithTrigger={false} className="flow-select-positioner">
    <Select.Popup className="flow-select-popup" ref={element => { popup.current = element; if (element && open) {
     tween.current?.kill(); gsap.killTweensOf(element.querySelectorAll('[role=option]'));
     tween.current = gsap.fromTo(element, {opacity:0,y:-6,scale:.98}, {opacity:1,y:0,scale:1,duration:duration(.22),ease:'power3.out',clearProps:'transform'});
     gsap.fromTo(element.querySelectorAll('[role=option]'), {opacity:0,y:4}, {opacity:1,y:0,duration:duration(.18),stagger:Math.min(.022,.25/Math.max(1,options.length)),ease:'power2.out',clearProps:'opacity,transform'});
    } }}>
     <Select.List>{options.map((option, index) => <span key={`${option.value}-${index}`}>{option.group && option.group !== options[index - 1]?.group && <span className="flow-select-group">{option.group}</span>}<Select.Item value={option.value} disabled={option.disabled} className="flow-select-option"><Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator><Check size={13} /></Select.ItemIndicator></Select.Item></span>)}</Select.List>
    </Select.Popup>
   </Select.Positioner></Select.Portal>
  </Select.Root>
 </span>;
}
