import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { gsap, useGSAP } from './ui';
import { countAxis, graphLabelIndices, graphPaths } from './line-graph';
import './animated-line-graph.css';

export type LineGraphSeries = { key: string; label: string; color: string };
export type LineGraphGroup = { label: string; values: Record<string, number | null> };
const display = (value: number) => Number(value.toFixed(2)).toLocaleString('en-IN');

/** Verdant's own SVG renderer; all data comes from the report's measured intervals. */
export function AnimatedLineGraph({ groups, series, title, hidden = new Set<string>(), emptyText = 'No answer timestamps were recorded for this selection.' }: {
  groups: LineGraphGroup[]; series: LineGraphSeries[]; title: string; hidden?: Set<string>; emptyText?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [measuredWidth, setWidth] = useState(0);
  const width = measuredWidth || 720;
  const [active, setActive] = useState<number | null>(null);
  const [keyboardIndex, setKeyboardIndex] = useState(0);
  const revealed = useRef(new Set<string>());
  const id = useId().replace(/:/g, '');
  const visible = series.filter(item => !hidden.has(item.key));
  const H = 335, left = 46, right = 24, top = 30, bottom = 48;
  const plotWidth = width - left - right, plotHeight = H - top - bottom, baseline = H - bottom;
  const valueAt = (group: LineGraphGroup, key: string) => { const value = group.values[key]; return typeof value === 'number' && Number.isFinite(value) ? value : null; };
  const hasValues = groups.some(group => visible.some(item => valueAt(group, item.key) !== null));
  const { ceiling, ticks } = countAxis(groups.flatMap(group => series.flatMap(item => { const value = valueAt(group, item.key); return value === null ? [] : [value]; })));
  const x = (index: number) => left + (groups.length > 1 ? index / (groups.length - 1) : .5) * plotWidth;
  const y = (value: number) => baseline - value / ceiling * plotHeight;
  const labels = new Set(graphLabelIndices(groups.length, plotWidth));
  const dataKey = JSON.stringify([groups, series.map(item => item.key)]);
  const selected = active !== null ? groups[active] : null;

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const resize = () => setWidth(Math.max(300, Math.round(root.getBoundingClientRect().width)));
    resize();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }
    const observer = new ResizeObserver(resize); observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useGSAP((_context, contextSafe) => {
    const root = ref.current;
    if (!root || !groups.length || !measuredWidth) return;
    const paths = Array.from(root.querySelectorAll<SVGPathElement>('.alg-line'));
    const dots = root.querySelectorAll<SVGCircleElement>('.alg-dot');
    const clip = root.querySelector<SVGRectElement>('.alg-reveal-clip');
    if (revealed.current.has(dataKey) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      revealed.current.add(dataKey);
      gsap.set(clip, { attr: { width: plotWidth } });
      return;
    }
    paths.forEach(path => { const length = path.getTotalLength(); gsap.set(path, { strokeDasharray: length, strokeDashoffset: length }); });
    gsap.set(dots, { opacity: 0, scale: .65, transformOrigin: '50% 50%' });
    gsap.set(clip, { attr: { width: 0 } });
    let observer: IntersectionObserver | null = null;
    const reveal = contextSafe!(() => {
      if (revealed.current.has(dataKey)) return;
      revealed.current.add(dataKey); observer?.disconnect();
      // Match the reference's deliberate two-second draw, without delaying interaction.
      paths.forEach((path, index) => gsap.to(path, { strokeDashoffset: 0, duration: 2, delay: index * .07, ease: 'power2.inOut', clearProps: 'strokeDasharray,strokeDashoffset' }));
      gsap.to(clip, { attr: { width: plotWidth }, duration: 2, ease: 'power2.inOut' });
      Array.from(dots).forEach(dot => gsap.to(dot, { opacity: 1, scale: 1, duration: .24, delay: Number(dot.dataset.progress) * 1.8 + .07, ease: 'back.out(1.5)', clearProps: 'transform,opacity' }));
    });
    const bounds = root.getBoundingClientRect();
    if (!('IntersectionObserver' in window) || bounds.bottom > 0 && bounds.top < window.innerHeight) reveal();
    else { observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) reveal(); }, { threshold: .08 }); observer.observe(root); }
    return () => observer?.disconnect();
  }, { scope: ref, dependencies: [dataKey, measuredWidth], revertOnUpdate: true });

  const show = (index: number) => { setActive(index); setKeyboardIndex(index); };
  const keyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    if (event.key === 'Escape') { setActive(null); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(index); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : Math.min(groups.length - 1, Math.max(0, index + (event.key === 'ArrowRight' ? 1 : -1)));
    show(next); ref.current?.querySelector<SVGGElement>(`[data-interval="${next}"]`)?.focus();
  };

  return <div ref={ref} className="animated-line-graph" onPointerLeave={() => { if (!ref.current?.contains(document.activeElement)) setActive(null); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setActive(null); }}>
    <svg viewBox={`0 0 ${width} ${H}`} role="group" aria-label={`${title}. Use left and right arrow keys to explore the recorded intervals.`}>
      <defs>
        <clipPath id={`${id}-clip`}><rect className="alg-reveal-clip" x={left} y={top - 12} width={plotWidth} height={plotHeight + 24} /></clipPath>
        {series.map(item => <linearGradient key={item.key} id={`${id}-${item.key}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={item.color} stopOpacity=".16" /><stop offset="100%" stopColor={item.color} stopOpacity="0" /></linearGradient>)}
      </defs>
      {ticks.map(value => <g key={value}><line className="alg-grid" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text className="alg-label" x={left - 10} y={y(value) + 4} textAnchor="end">{display(value)}</text></g>)}
      <text className="alg-axis-title" x={left} y={14}>Questions</text>
      {groups.map((group, index) => labels.has(index) && <g key={`label-${index}`}><line className="alg-grid alg-grid-vertical" x1={x(index)} x2={x(index)} y1={top} y2={baseline} /><text className="alg-label" x={x(index)} y={H - 22} textAnchor={index === 0 && groups.length > 1 ? 'start' : index === groups.length - 1 && groups.length > 1 ? 'end' : 'middle'}><title>{group.label}</title>{group.label}</text></g>)}
      {series.map(item => {
        const points = groups.map((group, index) => { const value = valueAt(group, item.key); return value === null ? null : { x: x(index), y: y(value) }; });
        const segments: { x: number; y: number }[][] = [];
        for (const point of points) { if (!point) { if (segments.at(-1)?.length) segments.push([]); } else { if (!segments.length) segments.push([]); segments[segments.length - 1].push(point); } }
        return <g key={item.key} className={`alg-series ${hidden.has(item.key) ? 'alg-hidden' : ''}`} style={{ '--alg-color': item.color } as CSSProperties} aria-hidden="true">
          {segments.filter(points => points.length).map((points, index) => { const { line, area } = graphPaths(points, baseline); return <g key={index}>{area && <path className="alg-area" d={area} fill={`url(#${id}-${item.key})`} clipPath={`url(#${id}-clip)`} />}<path className="alg-line" d={line} fill="none" stroke={item.color} strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" /></g>; })}
          {points.map((point, index) => point && <circle key={index} className={`alg-dot ${active === index ? 'alg-dot-active' : ''}`} cx={point.x} cy={point.y} r={active === index ? 5.5 : 4} data-progress={groups.length > 1 ? index / (groups.length - 1) : 0} fill={item.color} />)}
        </g>;
      })}
      {selected && active !== null && visible.length > 0 && <line className="alg-cursor" x1={x(active)} x2={x(active)} y1={top} y2={baseline} />}
      {visible.length > 0 && groups.map((group, index) => {
        const hitStart = index === 0 ? left - 10 : (x(index - 1) + x(index)) / 2;
        const hitEnd = index === groups.length - 1 ? width - right + 10 : (x(index) + x(index + 1)) / 2;
        return <g key={`interval-${index}`} data-interval={index} className="alg-interval" role="button" tabIndex={Math.min(keyboardIndex, groups.length - 1) === index ? 0 : -1} aria-label={`${group.label}. ${visible.map(item => { const value = valueAt(group, item.key); return `${item.label}: ${value === null ? 'not recorded' : `${display(value)} questions`}`; }).join('. ')}`} aria-describedby={active === index ? `${id}-tooltip` : undefined} onPointerEnter={() => show(index)} onPointerDown={() => show(index)} onFocus={() => show(index)} onKeyDown={event => keyDown(event, index)}>
        <rect x={hitStart} y={top - 10} width={hitEnd - hitStart} height={plotHeight + 20} fill="transparent" />
        <title>{group.label}</title>
      </g>; })}
    </svg>
    {selected && active !== null && visible.length > 0 && <div id={`${id}-tooltip`} role="tooltip" className="alg-tooltip" style={{ left: `clamp(96px, ${x(active) / width * 100}%, calc(100% - 96px))` }}><strong>{selected.label}</strong>{visible.map(item => <span key={item.key}><i style={{ background: item.color }} />{item.label}<b>{valueAt(selected, item.key) === null ? 'Not recorded' : `${display(valueAt(selected, item.key)!)} Qs`}</b></span>)}</div>}
    {(!groups.length || !visible.length || !hasValues) && <div className="alg-empty">{!visible.length && groups.length ? 'Select a legend item to show it.' : emptyText}</div>}
    <p className="alg-instructions">Hover, tap, or use arrow keys for exact counts. Each point is one recorded interval; curves show the trend.</p>
  </div>;
}
