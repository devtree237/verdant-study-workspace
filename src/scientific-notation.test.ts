import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import { normalizeScientificMarkdown, prepareScientificMarkdown, toUnicodeScript } from './scientific-notation';
import { renderMathFormula } from './mathjax-engine';

function render(source: string) {
  const prepared = prepareScientificMarkdown(source);
  return renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkMath], children: prepared.source, components: { code: ({ children, className }) => {
    if (!className?.includes('math-')) return createElement('code', { className }, children);
    const value = String(children).replace(/\n$/, ''), mathML = prepared.mathML.get(value);
    try { const result = renderMathFormula(mathML ?? value, mathML ? 'mathml' : 'tex', className.includes('math-display')); return createElement('span', { dangerouslySetInnerHTML: { __html: result.html + result.mathml } }); }
    catch { return createElement('code', { className: 'math-source-error' }, mathML ?? value); }
  } } }));
}

describe('explicit scientific notation', () => {
  it('renders explicit inline vectors/fractions and block matrices/aligned equations', () => {
    const source = String.raw`Velocity \(\vec{v}=\frac{\Delta x}{\Delta t}\).
\[\begin{aligned} F&=ma\\ E&=mc^2 \end{aligned}\]
\[\begin{pmatrix}1&0\\0&1\end{pmatrix}\]`;
    const html = render(source);
    expect(html).toContain('class="MathJax"');
    expect(html.match(/display="true"/g)).toHaveLength(2);
    expect(html).toContain('<mfrac>');
    expect(html).toContain('<mtable');
    expect(html).not.toContain('math-source-error');
  });

  it('supports explicit chemistry reactions, ionic charges and physical units', () => {
    const html = render(String.raw`\ce{2 H2 + O2 -> 2 H2O}; \(\ce{SO4^2-}\), \pu{9.8 m s-2}`);
    expect(html.match(/class="MathJax"/g)).toHaveLength(3);
    expect(html).toContain('<msub');
    expect(html).toContain('<msup');
    expect(html).not.toContain('math-source-error');
  });

  it('preserves fenced and inline code, escapes, ordinary chemical tokens and currency', () => {
    const source = [String.raw`H2O and x2 cost $25. Literal \\(x\\).`, '`\\(x^2\\)`', String.raw`
~~~tex
\[x^2\] and \ce{H2O}
~~~
`].join('\n');
    expect(normalizeScientificMarkdown(source)).toBe(source);
    expect(normalizeScientificMarkdown(String.raw`Already $x^2$ and $$y_1$$.`)).toBe('Already $x^2$ and \n\n$$\ny_1\n$$\n\n.');
    const nestedBacktick = '`literal `` and \\(x^2\\) stay code`';
    expect(normalizeScientificMarkdown(nestedBacktick)).toBe(nestedBacktick);
  });

  it('retains malformed delimiters/macros and renders unsupported math as readable source', () => {
    const source = String.raw`Incomplete \(x^2 or \textsubscript{2 or \ce{H2O`;
    expect(normalizeScientificMarkdown(source)).toBe(source);
    const html = render(String.raw`\(\unknowncommand{x}\)`);
    expect(html).toContain('unknowncommand');
    expect(render(String.raw`\(\frac{1}\)`)).toContain('math-source-error');
  });

  it('preserves explicit text scripts without enabling arbitrary HTML', () => {
    expect(normalizeScientificMarkdown(String.raw`H\textsubscript{3}O\textsuperscript{+} and SO<sub>4</sub><sup>2−</sup>`)).toBe('H₃O⁺ and SO₄²⁻');
    expect(normalizeScientificMarkdown(String.raw`$x\textsubscript{max}$`)).toBe(String.raw`$x_{\text{max}}$`);
    expect(normalizeScientificMarkdown('<sub onclick="alert(1)">2</sub>')).toBe('<sub onclick="alert(1)">2</sub>');
    expect(render('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('does not drop unsupported script characters or unbalance nested chemistry groups', () => {
    expect(toUnicodeScript('2−', 'sup')).toBe('²⁻');
    expect(toUnicodeScript('14', 'sub')).toBe('₁₄');
    expect(toUnicodeScript('charge', 'sup')).toBeNull();
    expect(normalizeScientificMarkdown(String.raw`\ce{A ->[{heat}] B}`)).toBe(String.raw`$\ce{A ->[{heat}] B}$`);
  });
  it('shields multiline MathML and text-only TeX annotations from Markdown without token collisions', () => {
    const source = 'VDMML0 is plain text. <math display="block"><semantics>\n<mfrac><mi>x</mi><mn>2</mn></mfrac><annotation encoding="application/x-tex">$x_2$</annotation>\n</semantics></math>';
    const prepared = prepareScientificMarkdown(source);
    expect(prepared.mathML.size).toBe(1); expect(prepared.source).toContain('VDMML0 is plain text. $VDMMLX0$');
    expect(normalizeScientificMarkdown(source)).toBe(source);
    expect(render(source)).toContain('<mfrac>');
  });
  it('keeps MathML examples in code literal while rejecting active MathML attributes during render', () => {
    const code = '`<math><mi>x</mi></math>`\n\n```xml\n<math><mi>x</mi></math>\n```';
    expect(prepareScientificMarkdown(code).mathML.size).toBe(0);
    const html = render('<math onclick="alert(1)"><mi>x</mi></math>');
    expect(html).toContain('math-source-error'); expect(html).not.toContain('<math onclick');
  });
  it('makes same-line double-dollar equations blocks while preserving inline and fenced examples', () => {
    const source = String.raw`Before $$\begin{pmatrix}a&b\\c&d\end{pmatrix}$$ after $x_1$`;
    const html = render(source);
    expect(html.match(/display="true"/g)).toHaveLength(1);
    expect(html.match(/class="MathJax"/g)).toHaveLength(2);
    expect(html).toContain('<mtable');
    const literal = '`$$x^2$$`\n\n```tex\n$$x^2$$\n```';
    expect(normalizeScientificMarkdown(literal)).toBe(literal);
    expect(render(literal)).not.toContain('class="MathJax"');
  });
});
