import { describe, expect, it } from 'vitest';
import { sanitizeMathML } from './mathml';

describe('non-executing Presentation MathML', () => {
  it('preserves fractions/scripts/tables and canonicalizes namespace prefixes/entities', () => {
    const result = sanitizeMathML('<m:math xmlns:m="http://www.w3.org/1998/Math/MathML" display="block"><m:mrow><m:mi>&alpha;</m:mi><m:mo>&#x2264;</m:mo><m:mfrac><m:mn>1</m:mn><m:msup><m:mi>x</m:mi><m:mn>2</m:mn></m:msup></m:mfrac></m:mrow></m:math>');
    expect(result.source).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
    expect(result.source).toContain('<mi>α</mi>'); expect(result.source).toContain('<mo>≤</mo>'); expect(result.display).toBe(true);
    expect(result.plainText).toBe('α≤1x2');
  });
  it('keeps ordinary text and annotations escaped without executing their contents', () => {
    const result = sanitizeMathML('<math><semantics><mi>x</mi><annotation encoding="application/x-tex">\\text{&lt;script&gt;}</annotation></semantics></math>');
    expect(result.source).toContain('&lt;script&gt;'); expect(result.plainText).toBe('x');
  });
  it('rejects active markup, URLs, style, external namespaces and XML entity declarations', () => {
    for (const source of ['<!DOCTYPE math [<!ENTITY x SYSTEM "file:///private">]><math><mi>&x;</mi></math>', '<?xml version="1.0"?><math/>', '<math><script>alert(1)</script></math>', '<math onclick="alert(1)"><mi>x</mi></math>', '<math><mi style="background:url(https://example.org)">x</mi></math>', '<math><mi href="https://example.org">x</mi></math>', '<math xmlns="https://example.org"><mi>x</mi></math>', '<math><annotation-xml encoding="text/html"><img/></annotation-xml></math>', '<math><mi>&external;</mi></math>']) expect(() => sanitizeMathML(source)).toThrow();
  });
  it('rejects malformed, duplicate, deeply nested and multiple-root expressions', () => {
    for (const source of ['<math><mi>x</math>', '<math><mi>x</mi></math><math/>', '<math display="block" display="inline"/>', '<math><mi>&#0;</mi></math>', '<math>' + '<mrow>'.repeat(82) + 'x' + '</mrow>'.repeat(82) + '</math>']) expect(() => sanitizeMathML(source)).toThrow();
    expect(() => sanitizeMathML('<math>' + 'x'.repeat(64_000) + '</math>')).toThrow('large');
  });
  it('rejects pathological script/size/spacing values while retaining normal mathematical layout', () => {
    for (const source of ['<math mathsize="999999999em"><mi>x</mi></math>', '<math scriptlevel="-9999999"><mi>x</mi></math>', '<math><mspace width="1e100em"/></math>', '<math><mspace height="10000px"/></math>', '<math><mtable rowspacing="500em"><mtr><mtd><mi>x</mi></mtd></mtr></mtable></math>']) expect(() => sanitizeMathML(source)).toThrow();
    expect(sanitizeMathML('<math mathsize="120%"><mstyle scriptlevel="+1"><mi>x</mi></mstyle><mspace width="0.5em"/></math>').source).toContain('width="0.5em"');
  });
});
