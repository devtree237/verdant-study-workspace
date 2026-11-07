"use client";
import { useEffect, useId, useRef, useState } from 'react';
import './FolderFloat.css';

/** Folder previews always use saved materials, never sample documents. */
export default function FolderFloat({
  items = [], label = 'Study materials', sublabel = '', trigger = 'hover',
  defaultOpen = false, closeOnSelect = true, onSelect, onActivate, onOpenChange,
  folderColor = '#7855ed', frontColor = '#8b68fa', paperColor = '#f6f1ff',
  itemTextColor = '#38284e', labelColor = '#fff', width = 200, height = 148,
  openDuration = 560, stagger = 45, className = ''
}) {
  const list = items.map(item => typeof item === 'string' ? { label: item, value: item } : item);
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef(null), triggerRef = useRef(null), pointerInside = useRef(false);
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;
  const id = useId().replace(/:/g, '');
  const sub = sublabel || `${list.length} ${list.length === 1 ? 'material' : 'materials'}`;
  useEffect(() => { changeRef.current?.(open); }, [open]);
  useEffect(() => {
    if (trigger !== 'hover') return;
    const target = rootRef.current?.closest('.folder-card') || rootRef.current;
    if (!target) return;
    const enter = event => {
      if (event.pointerType === 'touch') return;
      pointerInside.current = true;
      setOpen(true);
    };
    const leave = () => {
      pointerInside.current = false;
      if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
    };
    target.addEventListener('pointerenter', enter);
    target.addEventListener('pointerleave', leave);
    return () => {
      target.removeEventListener('pointerenter', enter);
      target.removeEventListener('pointerleave', leave);
    };
  }, [trigger]);
  function select(item, index) {
    if (closeOnSelect) { triggerRef.current?.focus({ preventScroll: true }); setOpen(false); }
    onSelect?.(item.value, index);
  }
  return <div ref={rootRef} className={`folder-float ${className}`} data-open={open || undefined} data-empty={!list.length || undefined}
    onClick={event => { if (onActivate && !event.target.closest('button')) onActivate(); }}
    onFocus={() => setOpen(true)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !pointerInside.current) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.stopPropagation(); triggerRef.current?.focus({ preventScroll: true }); setOpen(false); }
    }}
    style={{ '--ff-w': `${width}px`, '--ff-h': `${height}px`, '--ff-back': folderColor,
      '--ff-front': frontColor, '--ff-paper': paperColor, '--ff-item-ink': itemTextColor,
      '--ff-label': labelColor, '--ff-open': `${openDuration}ms`, '--ff-stagger': `${stagger}ms` }}>
    <div className="folder-float__folder">
      <svg className="folder-float__back" viewBox="0 0 200 138" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs><linearGradient id={`${id}-back`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--ff-back)" /><stop offset=".55" stopColor="var(--ff-front)" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--ff-back), #281154 38%)" />
        </linearGradient></defs>
        <path d="M3 23Q3 7 19 7H66Q73 7 78 13L87 24H181Q197 24 197 40V120Q197 135 181 135H19Q3 135 3 119Z" fill={`url(#${id}-back)`} />
        <path d="M19 8H66Q73 8 78 14L87 25H181Q196 25 196 40" fill="none" stroke="#fff" strokeOpacity=".27" />
        <path d="M18 36H182V117H18Z" fill="#24123b" fillOpacity=".32" />
      </svg>
      <button ref={triggerRef} type="button" className="folder-float__trigger" aria-expanded={onActivate ? undefined : open}
        aria-label={onActivate ? `Open ${label} folder, ${sub}` : `${label}, ${sub}`}
        onClick={() => onActivate ? onActivate() : setOpen(value => !value)} />
      <div className="folder-float__papers">
        {list.map((item, index) => {
          const center = index - (list.length - 1) / 2;
          return <button key={`${item.value}-${index}`} type="button" className="folder-float__sheet"
            title={item.title || item.label} aria-label={`Open material: ${item.title || item.label}`}
            tabIndex={open ? 0 : -1} aria-hidden={!open}
            style={{ '--sheet-index': index, '--sheet-x': `${Math.max(-40, Math.min(40, center * 70))}px`,
              '--sheet-y': `${-66 - Math.min(index, 2) * 10}px`, '--sheet-angle': `${Math.max(-9, Math.min(9, center * 12))}deg`,
              '--sheet-rest-angle': `${center * 3}deg` }}
            onClick={event => { event.stopPropagation(); select(item, index); }}>
            <span className="folder-float__sheet-fold" aria-hidden="true" />
            <svg className="folder-float__sheet-icon" width="16" height="18" viewBox="0 0 16 18" fill="none" aria-hidden="true"><path d="M3 1h6l4 4v12H3V1Z" stroke="currentColor" strokeWidth="1.2" /><path d="M9 1v4h4M5.5 9h5M5.5 12h4" stroke="currentColor" strokeWidth="1.2" /></svg>
            <span className="folder-float__sheet-title">{item.title || item.label}</span>
            <span className="folder-float__sheet-lines" aria-hidden="true"><i /><i /><i /></span>
          </button>;
        })}
      </div>
      <div className="folder-float__front" aria-hidden="true">
        <svg viewBox="0 0 200 108" preserveAspectRatio="none" focusable="false">
          <defs><linearGradient id={`${id}-front`} x1="0" y1="0" x2=".7" y2="1">
            <stop offset="0" stopColor="color-mix(in srgb, var(--ff-front), #cbb9ff 24%)" />
            <stop offset=".48" stopColor="var(--ff-front)" /><stop offset="1" stopColor="var(--ff-back)" />
          </linearGradient></defs>
          <path d="M15 2H185Q200 2 198 18L192 91Q190 106 174 106H26Q10 106 8 91L2 18Q0 2 15 2Z" fill={`url(#${id}-front)`} />
          <path d="M15 3H185Q197 3 197 15" fill="none" stroke="#fff" strokeOpacity=".35" />
          <path d="M9 90Q11 105 26 105H174Q189 105 191 90" fill="none" stroke="#28104f" strokeOpacity=".14" />
        </svg>
        <span className="folder-float__label">{label}</span><span className="folder-float__sub">{sub}</span>
      </div>
    </div>
  </div>;
}
