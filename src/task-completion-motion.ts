import { duration, gsap, motion } from './ui';

export function playCompletionTick(area: HTMLElement | null, taskId: string) {
  if (!area || !duration(1)) return;
  const checkbox = area.querySelector<HTMLElement>(
    `[data-task-id="${CSS.escape(taskId)}"] .task-checkbox[aria-pressed=true]`,
  );
  const bounds = checkbox?.getBoundingClientRect();
  const clip = area.getBoundingClientRect();
  const onCard = checkbox && bounds && bounds.left >= clip.left && bounds.right <= clip.right &&
    bounds.top >= 0 && bounds.bottom <= window.innerHeight;
  const indicator = onCard ? checkbox : document.querySelector<HTMLElement>('.toast-check');
  if (!indicator) return;

  const path = indicator.querySelector<SVGGeometryElement>('path, polyline');
  if (path) {
    const length = path.getTotalLength();
    gsap.set(path, { strokeDasharray: `${length} ${length}`, strokeDashoffset: length });
  }
  const animation = gsap.timeline({ delay: onCard ? .2 : 0 });
  animation.fromTo(indicator, { scale: .86 }, {
    scale: 1, duration: .32, ease: motion.spring, clearProps: 'transform', overwrite: 'auto',
  });
  if (path) animation.to(path, {
    strokeDashoffset: 0, duration: .24, ease: motion.easeOut,
    clearProps: 'strokeDasharray,strokeDashoffset', overwrite: 'auto',
  }, .02);
}
