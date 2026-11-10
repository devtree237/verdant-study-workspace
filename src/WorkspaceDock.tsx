import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronUp } from 'lucide-react';

export function WorkspaceDock({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const dock = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const mouseInside = useRef(false);
  const openedByHover = useRef(false);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && !dock.current?.contains(target) && !target.closest('[role=dialog]')) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  return <aside
    ref={dock}
    className="workspace-dock"
    aria-label="Workspace dock"
    data-expanded={open}
    onPointerEnter={event => {
      if (event.pointerType !== 'mouse') return;
      mouseInside.current = true;
      if (!open) {
        openedByHover.current = true;
        setOpen(true);
      }
    }}
    onPointerLeave={event => {
      if (event.pointerType !== 'mouse') return;
      mouseInside.current = false;
      const focused = document.activeElement;
      if (!focused?.closest('[role=dialog]') && !(focused?.matches(':focus-visible') && event.currentTarget.contains(focused))) {
        setOpen(false);
      }
    }}
    onBlur={event => {
      const next = event.relatedTarget;
      if (!mouseInside.current && !event.currentTarget.contains(next) && !next?.closest('[role=dialog]')) setOpen(false);
    }}
    onKeyDown={event => {
      if (event.key !== 'Escape' || !open) return;
      event.stopPropagation();
      handle.current?.focus({ preventScroll: true });
      setOpen(false);
    }}
  >
    <button
      ref={handle}
      className="workspace-dock-handle"
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={event => {
        // A pointer click on the resting pill usually arrives just after hover opens it.
        if (!openedByHover.current || event.detail === 0) setOpen(current => !current);
        else setOpen(true);
        openedByHover.current = false;
      }}
    >
      <ChevronUp size={15} aria-hidden="true"/>
      <span>Dock</span>
    </button>
    <div className="workspace-dock-controls" id={panelId} inert={!open}>
      {children}
    </div>
  </aside>;
}
