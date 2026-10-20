import type { RefObject } from 'react';
import { gsap, useGSAP, duration, motion } from './ui';

/** Botanical Calm: feedback, continuity and hierarchy with one scoped lifecycle. */
export function useWorkspaceMotion(scope: RefObject<HTMLDivElement | null>) {
  useGSAP((_context, contextSafe) => {
    const root = scope.current;
    if (!root) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const seen = new WeakSet<Element>();
    const cardSelector = '.task-card,.mistake-card,.folder-card,.resource-row,.label-card,.analytics-panel,.empty-state,.question-editor,.sidebar-folder-tree,.subject-subnav,.test-card';
    let frame = 0;
    let route = '';
    let indicatorReady = false;
    const nav = root.querySelector<HTMLElement>('.sidebar-nav');
    const indicator = document.createElement('span');
    indicator.className = 'active-nav-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    if (nav) {
      nav.prepend(indicator);
      nav.classList.add('has-motion-indicator');
    }

    const reveal = contextSafe!((nodes: Element[]) => {
      const fresh = nodes.filter(node => !seen.has(node) && node.getClientRects().length);
      fresh.forEach(node => seen.add(node));
      if (!fresh.length || media.matches) return;
      gsap.fromTo(fresh, { opacity: 0, y: 4 }, {
        opacity: 1, y: 0, duration: motion.state, stagger: .025,
        ease: motion.easeOut, clearProps: 'opacity,transform', overwrite: 'auto',
      });
    });

    const positionIndicator = contextSafe!(() => {
      if (!nav) return;
      const active = nav.querySelector<HTMLElement>('.nav-item.active,.subject-nav.active');
      if (!active || !active.getClientRects().length) {
        gsap.set(indicator, { opacity: 0 });
        return;
      }
      const parent = nav.getBoundingClientRect();
      const box = active.getBoundingClientRect();
      const target = { x: box.left - parent.left, y: box.top - parent.top, width: box.width, height: box.height, opacity: 1 };
      if (!indicatorReady || media.matches) gsap.set(indicator, target);
      else gsap.to(indicator, { ...target, duration: motion.state, ease: motion.easeSoft, overwrite: true });
      indicatorReady = true;
    });

    const cascade = contextSafe!(() => {
      const next = root.querySelector('.page-heading h1')?.textContent || '';
      if (next === route) return;
      route = next;
      if (media.matches) return;
      const header = root.querySelectorAll('.page-heading .page-eyebrow,.page-heading h1,.page-heading p,.page-heading-actions');
      gsap.fromTo(header, { y: 8, opacity: 0 }, {
        y: 0, opacity: 1, duration: .24, stagger: .025,
        ease: motion.easeOut, clearProps: 'opacity,transform', overwrite: 'auto',
      });
      const primary = root.querySelectorAll('.daily-progress,.learning-banner,.analytics-hero,.analytics-stats>div,.module-summary>div,.test-summary>div');
      gsap.fromTo(primary, { y: 8, opacity: 0 }, {
        y: 0, opacity: 1, duration: .3, stagger: .04, delay: .08,
        ease: motion.easeOut, clearProps: 'opacity,transform', overwrite: 'auto',
      });
    });

    const layout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { positionIndicator(); cascade(); });
    };
    if (!media.matches) gsap.fromTo(root.querySelectorAll('.sidebar-brand,.workspace-name,.quick-add,.nav-item,.subject-nav,.sidebar-bottom'),
      { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: .3, stagger: .02, ease: motion.easeOut, clearProps: 'opacity,transform', onComplete: layout });
    reveal(Array.from(root.querySelectorAll(cardSelector)));
    layout();

    const observer = new MutationObserver(contextSafe!((mutations: MutationRecord[]) => {
      const added: Element[] = [];
      for (const mutation of mutations) for (const node of mutation.addedNodes) {
        if (!(node instanceof Element) || node === indicator) continue;
        if (node.matches(cardSelector)) added.push(node);
        added.push(...node.querySelectorAll(cardSelector));
      }
      reveal(added);
      layout();
    }));
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-current'] });
    const resize = new ResizeObserver(layout);
    if (nav) resize.observe(nav);
    const sidebar = root.querySelector('.sidebar');
    if (sidebar) resize.observe(sidebar);

    const over = contextSafe!((event: PointerEvent) => {
      if (media.matches || event.pointerType === 'touch' || !(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>('.folder-card,.mistake-card,.label-card,.resource-row,.test-card');
      if (card && !card.contains(event.relatedTarget as Node)) gsap.to(card, { boxShadow: '0 5px 20px rgba(16,60,35,.07)', duration: motion.fast, overwrite: 'auto' });
    });
    const out = contextSafe!((event: PointerEvent) => {
      if (media.matches || !(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>('.folder-card,.mistake-card,.label-card,.resource-row,.test-card');
      if (card && !card.contains(event.relatedTarget as Node)) gsap.to(card, { boxShadow: '0 2px 6px rgba(16,40,25,.03)', duration: motion.state, overwrite: 'auto', clearProps: 'boxShadow' });
    });
    const press = contextSafe!((event: Event) => {
      if (media.matches || !(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>('button');
      if (!button || button.disabled || button.classList.contains('task-checkbox')) return;
      gsap.fromTo(button, { scale: .97 }, { scale: 1, duration: .44, ease: motion.spring, clearProps: 'transform', overwrite: 'auto' });
    });
    const disclosure = contextSafe!((event: Event) => {
      const details = event.target as HTMLDetailsElement;
      if (media.matches || !details.open || !details.matches('details')) return;
      gsap.fromTo(Array.from(details.children).slice(1), { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: motion.state, stagger: .02, ease: motion.easeOut, clearProps: 'opacity,transform' });
    });
    const preference = () => {
      if (media.matches) {
        const moving = root.querySelectorAll<HTMLElement>(`${cardSelector},.page-heading .page-eyebrow,.page-heading h1,.page-heading p,.page-heading-actions,button`);
        gsap.killTweensOf(moving);
        gsap.set(moving, { clearProps: 'opacity,transform' });
      }
      layout();
    };
    root.addEventListener('pointerover', over);
    root.addEventListener('pointerout', out);
    root.addEventListener('click', press);
    root.addEventListener('toggle', disclosure, true);
    media.addEventListener('change', preference);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect(); resize.disconnect(); indicator.remove();
      nav?.classList.remove('has-motion-indicator');
      root.removeEventListener('pointerover', over); root.removeEventListener('pointerout', out);
      root.removeEventListener('click', press); root.removeEventListener('toggle', disclosure, true);
      media.removeEventListener('change', preference);
    };
  }, { scope });
}
