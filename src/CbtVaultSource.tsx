import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileText, FolderOpen, LoaderCircle, Search, X } from 'lucide-react';
import { fileStore, useStore } from './store';
import { readCbtPdf } from './cbt-pdf';
import type { CbtPdfLayout } from './cbt-pdf';

export function CbtVaultSource({ layout, onSelect, onCancel, onReadingChange }: { layout: CbtPdfLayout; onSelect: (source: { text: string; format: 'text'|'latex'; name: string; notices: string[] }) => void; onCancel: () => void; onReadingChange: (reading: boolean)=>void }) {
  const { data } = useStore();
  const [query, setQuery] = useState(''), [selected, setSelected] = useState(''), [from, setFrom] = useState(1), [to, setTo] = useState(1), [chapter, setChapter] = useState('');
  const [progress, setProgress] = useState(''), [error, setError] = useState('');
  const sequence = useRef(0), readingCallback = useRef(onReadingChange); readingCallback.current = onReadingChange;
  useEffect(()=>()=>{sequence.current++;readingCallback.current(false);},[]);
  const resource = data.resources.find(item => item.id === selected);
  const files = data.resources.filter(item => item.fileKey && /\.(?:pdf|tex)$/i.test(item.fileName || '') && `${item.title} ${item.fileName}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.updated.localeCompare(a.updated));
  async function read() {
    if (!resource?.fileKey) return;
    const token=++sequence.current;setError(''); setProgress('Opening saved material…');onReadingChange(true);
    try {
      const blob = await fileStore('get', resource.fileKey); if(token!==sequence.current)return; if (!blob) throw new Error('This file is missing from this browser. Upload the original to Resource Vault again.');
      const name = resource.fileName || resource.title;
      let text: string, format: 'text'|'latex', notices: string[];
      if (/\.pdf$/i.test(name)) {
        const result = await readCbtPdf(new File([blob], name, { type: 'application/pdf' }), message=>{if(token!==sequence.current)throw new Error('Reading cancelled.');setProgress(message);}, layout, { from, to });
        text = result.text; format = 'text'; notices = result.warnings;
      } else { text = await blob.text(); format = 'latex'; notices = ['Saved LaTeX was read locally; external macros and files are not executed.']; }
      // A chapter search selects an explicit heading through the next numbered
      // chapter/section, preserving the original text for mandatory review.
      if (chapter.trim()) {
        const lines = text.split('\n'), index = lines.findIndex(line => line.toLowerCase().includes(chapter.trim().toLowerCase()));
        if (index < 0) throw new Error('That chapter heading was not found in these pages. Adjust the range or clear the chapter filter.');
        let finish = lines.findIndex((line, at) => at > index && /^(?:chapter\s+\d+|\\(?:chapter|section)\*?\{)/i.test(line.trim())); if (finish < 0) finish = lines.length;
        text = lines.slice(index, finish).join('\n'); notices.push('Chapter text begins at the first matching heading. Check the selected section before applying it.');
      }
      if(token===sequence.current)onSelect({ text, format, name: `${resource.title}${format === 'text' ? ` · pages ${from}–${to}` : ''}`, notices });
    } catch (failure) { if(token===sequence.current)setError(failure instanceof Error ? failure.message : 'The saved source could not be read.'); }
    finally { if(token===sequence.current){setProgress('');onReadingChange(false);} }
  }
  return <section className="cbt-vault-source" aria-label="Select a Resource Vault source">
    <header><b><FolderOpen size={15}/>Previous PDFs / Resource Vault</b><button type="button" className="icon-btn" aria-label={progress?'Cancel material reading':'Close material picker'} onClick={()=>{sequence.current++;onReadingChange(false);onCancel();}}><X size={15}/></button></header>
    <label className="cbt-vault-search"><Search size={14}/><input aria-label="Search saved PDFs" placeholder="Search your uploaded materials" value={query} disabled={!!progress} onChange={event=>setQuery(event.target.value)}/></label>
    <div className="cbt-vault-files">{files.map(item=><button type="button" disabled={!!progress} className={selected===item.id?'selected':''} key={item.id} onClick={()=>{setSelected(item.id);setFrom(1);setTo(item.pageCount || 1);setError('');}}><FileText size={16}/><span><b>{item.title}</b><small>{item.fileName}{item.pageCount ? ` · ${item.pageCount} pages` : ''}</small></span></button>)}{!files.length&&<p>No saved PDFs or LaTeX files match. Upload a material in Resource Vault, or attach a file directly.</p>}</div>
    {resource&&<><div className="cbt-vault-range">{/\.pdf$/i.test(resource.fileName||'')&&<><label>From page<input type="number" min={1} value={from} disabled={!!progress} onChange={event=>setFrom(Number(event.target.value))}/></label><label>To page<input type="number" min={from} value={to} disabled={!!progress} onChange={event=>setTo(Number(event.target.value))}/></label></>}<label>Chapter heading · optional<input value={chapter} disabled={!!progress} maxLength={200} onChange={event=>setChapter(event.target.value)} placeholder="Exact heading from your material"/></label></div><p className="cbt-import-note">Page numbers refer to PDF pages. Only the selected source is read; review the extracted text before applying it.</p></>}
    {error&&<p className="cbt-import-error" role="alert">{error}</p>}{progress&&<p role="status"><LoaderCircle className="cbt-import-spin" size={14}/>{progress}</p>}
    <footer><button type="button" className="text-link" disabled={!!progress} onClick={onCancel}><ArrowLeft size={13}/>Back</button><button type="button" className="button secondary small" disabled={!resource||!!progress} onClick={()=>void read()}>Use selected pages</button></footer>
  </section>;
}
