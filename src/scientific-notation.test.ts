import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/contrib/mhchem';
import { normalizeScientificMarkdown, toUnicodeScript } from './scientific-notation';

function render(source: string) {
  return renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkMath], rehypePlugins: [[rehypeKatex, { trust: false }]], children: normalizeScientificMarkdown(source) }));
}

describe('explicit scientific notation', () => {
  it('renders explicit inline vectors/fractions and block matrices/aligned equations', () => {
    const source = String.raw`Velocity \(\vec{v}=\frac{\Delta x}{\Delta t}\).
\[\begin{aligned} F&=ma\\ E&=mc^2 \end{aligned}\]
\[\begin{pmatrix}1&0\\0&1\end{pmatrix}\]`;
    const html = render(source);
    expect(html).toContain('class="katex"');
    expect(html.match(/class="katex-display"/g)).toHaveLength(2);
    expect(html).toContain('<mfrac>');
    expect(html).toContain('<mtable');
    expect(html).not.toContain('katex-error');
  });

  it('supports explicit chemistry reactions, ionic charges and physical units', () => {
    const html = render(String.raw`\ce{2 H2 + O2 -> 2 H2O}; \(\ce{SO4^2-}\), \pu{9.8 m s-2}`);
    expect(html.match(/class="katex"/g)).toHaveLength(3);
    expect(html).toContain('<msub');
    expect(html).toContain('<msup');
    expect(html).not.toContain('katex-error');
  });

  it('preserves fenced and inline code, escapes, ordinary chemical tokens and currency', () => {
    const source = [String.raw`H2O and x2 cost $25. Literal \\(x\\).`, '`\\(x^2\\)`', String.raw`
~~~tex
\[x^2\] and \ce{H2O}
~~~
`].join('\n');
    expect(normalizeScientificMarkdown(source)).toBe(source);
    expect(normalizeScientificMarkdown(String.raw`Already $x^2$ and $$y_1$$.`)).toBe(String.raw`Already $x^2$ and $$y_1$$.`);
    const nestedBacktick = '`literal `` and \\(x^2\\) stay code`';
    expect(normalizeScientificMarkdown(nestedBacktick)).toBe(nestedBacktick);
  });

  it('retains malformed delimiters/macros and renders unsupported math as readable source', () => {
    const source = String.raw`Incomplete \(x^2 or \textsubscript{2 or \ce{H2O`;
    expect(normalizeScientificMarkdown(source)).toBe(source);
    const html = render(String.raw`\(\unknowncommand{x}\)`);
    expect(html).toContain('unknowncommand');
    expect(render(String.raw`\(\frac{1}\)`)).toContain('katex-error');
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
});
