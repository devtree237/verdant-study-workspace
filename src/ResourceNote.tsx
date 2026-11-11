import { useEffect, useState } from 'react';
import { Markdown } from './ui';

export function ResourceNote({ children }: { children: string }) {
  const latex = /^(?:\s|%[^\n]*(?:\n|$))*\\(?:documentclass\b|begin\{document\}|(?:section|subsection|chapter|title|papertitle)\*?\s*\{)/.test(children);
  const [preview, setPreview] = useState<{source:string; markdown:string|null} | null>(null);

  useEffect(() => {
    if (!latex) return;
    let active = true;
    import('./resource-latex').then(
      ({ latexResourceToMarkdown }) => latexResourceToMarkdown(children),
    ).then(
      markdown => { if (active) setPreview({ source: children, markdown }); },
      () => { if (active) setPreview({ source: children, markdown: null }); },
    );
    return () => { active = false; };
  }, [children, latex]);

  if (!latex) return <Markdown>{children}</Markdown>;
  if (preview?.source !== children) return <p className="reader-hint" role="status">Rendering your LaTeX notes…</p>;
  if (preview.markdown === null) return <><p className="reader-hint">The LaTeX structure could not be read. Check the groups and environments in your source.</p><pre>{children}</pre></>;
  return <Markdown>{preview.markdown}</Markdown>;
}
