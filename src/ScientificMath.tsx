import { useEffect, useState } from 'react';
import type { MathFormat, MathRenderResult } from './mathjax-engine';

type RenderState = { key: string; result?: MathRenderResult; error?: string };
let engine: Promise<typeof import('./mathjax-engine')> | undefined;
export function loadMathRenderer() { return engine ??= import('./mathjax-engine'); }

/** React owns the wrapper; MathJax only serializes its separate LiteDOM tree. */
export function ScientificMath({ source, format = 'tex', display = false }: { source: string; format?: MathFormat; display?: boolean }) {
  const key = JSON.stringify([source, format, display]);
  const [state, setState] = useState<RenderState>({ key: '' });
  useEffect(() => {
    let current = true;
    loadMathRenderer().then(renderer => renderer.renderMathFormula(source, format, display)).then(result => {
      if (current) setState({ key, result });
    }).catch(error => { if (current) setState({ key, error: error instanceof Error ? error.message : 'This expression could not be displayed.' }); });
    return () => { current = false; };
  }, [source, format, display, key]);
  const result = state.key === key ? state.result : undefined;
  const error = state.key === key ? state.error : undefined;
  const block = result?.display ?? display;
  return <span className={`scientific-math ${block ? 'math-block' : 'math-inline'}`} data-math-state={result ? 'ready' : error ? 'error' : 'loading'} data-math-format={format} data-math-display={block ? 'block' : 'inline'}>
    {result ? <><span className="math-visual" aria-hidden="true" dangerouslySetInnerHTML={{ __html: result.html }} /><span className="math-assistive" dangerouslySetInnerHTML={{ __html: result.mathml }} /></> : <code className="math-source" title={error || 'Loading the local math renderer…'}>{source}</code>}
    {error && <span className="math-error-note"> Original notation shown. {error}</span>}
  </span>;
}
