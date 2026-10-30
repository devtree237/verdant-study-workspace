import { describe, expect, it } from 'vitest';
import { renderMathFormula } from './mathjax-engine';

describe('isolated bundled MathJax conversion', () => {
  it('renders vectors, fractions, aligned matrices and local uncommon glyph ranges as SVG plus MathML', () => {
    for (const source of [String.raw`\vec{v}=\frac{\Delta x}{\Delta t}`, String.raw`\begin{aligned}F&=ma\\E&=mc^2\end{aligned}`, String.raw`\begin{pmatrix}1&0\\0&1\end{pmatrix}`, String.raw`\mathbb{R}\ni x\rightsquigarrow\hbar`]) {
      const result = renderMathFormula(source, 'tex', true);
      expect(result.html).toContain('<svg'); expect(result.html).toContain('<path'); expect(result.mathml).toContain('<math');
      expect(result.html).not.toMatch(/(?:https?:\/\/|href=)[^\s>]*\.(?:js|woff|png)/);
      expect(result.html).not.toContain('<use'); expect(result.html).not.toContain('tabindex');
    }
  });
  it('renders mhchem reactions, ionic charges and units with no browser or global MathJax', () => {
    const result = renderMathFormula(String.raw`\ce{SO4^2- + Ba^2+ -> BaSO4 v}\quad\pu{9.8 m s-2}`);
    expect(result.html).toContain('<path'); expect(result.mathml).toContain('<msub'); expect(result.mathml).toContain('<msup');
    expect(result.html).not.toContain('<text');
    expect(result.mathml).not.toMatch(/[\uE400-\uE42F]|&#xE4[0-2][0-9a-f];/i);
    expect(result.mathml).toContain('→'); expect(result.label).toContain('yields');
    const ion = renderMathFormula(String.raw`\ce{SO4^2-}`);
    expect(ion.label).not.toMatch(/\bA\b/);
    expect(ion.label).toContain('subscript 4'); expect(ion.label).toContain('superscript 2 minus');
    expect((globalThis as { MathJax?: unknown }).MathJax).toBeUndefined();
  });
  it('renders sanitized Presentation MathML and uses its block display setting', () => {
    const result = renderMathFormula('<math display="block"><mfrac><mi>x</mi><msup><mi>t</mi><mn>2</mn></msup></mfrac></math>', 'mathml');
    expect(result.display).toBe(true); expect(result.mathml).toContain('<mfrac>'); expect(result.html).toContain('<svg');
    expect(renderMathFormula('<math><mi>x</mi></math>', 'mathml', true).display).toBe(true);
  });
  it('does not let macros, labels or equation state leak between formulas', () => {
    expect(renderMathFormula(String.raw`\newcommand{\myPrivateFormula}{x^2}\myPrivateFormula`).html).toContain('<svg');
    expect(() => renderMathFormula(String.raw`\myPrivateFormula`)).toThrow();
  });
  it('rejects unsafe/invalid notation and bounds oversized expressions', () => {
    for (const source of [String.raw`\href{javascript:alert(1)}{x}`, String.raw`\require{html}`, String.raw`\includegraphics{https://example.org/x}`, String.raw`\frac{1}`]) expect(() => renderMathFormula(source)).toThrow();
    expect(() => renderMathFormula('<math><mtext onclick="alert(1)">x</mtext></math>', 'mathml')).toThrow();
    expect(() => renderMathFormula('x'.repeat(32_001))).toThrow('large');
    expect(() => renderMathFormula(String.raw`\rule{1000000em}{1em}`)).toThrow('size');
  });
  it('caches complete isolated results without introducing cross-formula SVG IDs', () => {
    const first = renderMathFormula(String.raw`\sqrt{1-x^2}`);
    expect(renderMathFormula(String.raw`\sqrt{1-x^2}`)).toBe(first);
    expect(first.html).not.toContain('id='); expect(first.html).toContain('currentColor');
    expect(first.mathml).toContain('aria-label="square root');
  });
});
