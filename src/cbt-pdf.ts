import { MAX_FILE_SIZE } from './materials';

export type CbtPdfLayout = 'auto' | 'single' | 'two-column';
export type CbtPdfFragment = { text: string; x: number; y: number; width: number; height: number };
type Row = { y: number; height: number; fragments: CbtPdfFragment[] };

function rowsFromFragments(items: CbtPdfFragment[]): Row[] {
  const rows: Row[] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (!item.text.trim() || ![item.x,item.y,item.width,item.height].every(Number.isFinite)) continue;
    const row = rows.slice(-4).find(candidate => Math.abs(candidate.y - item.y) <= Math.max(2, Math.max(candidate.height,item.height) * .56));
    if (row) { row.fragments.push(item); if(item.height>row.height)row.y=item.y; row.height = Math.max(row.height,item.height); }
    else rows.push({ y:item.y, height:Math.max(1,item.height), fragments:[item] });
  }
  return rows.sort((a,b)=>a.y-b.y).map(row=>({...row,fragments:row.fragments.sort((a,b)=>a.x-b.x)}));
}
function lineText(fragments: CbtPdfFragment[]): string {
  let result='', previous: CbtPdfFragment | undefined;
  for (const fragment of fragments) {
    const gap=previous ? fragment.x-(previous.x+previous.width) : 0;
    const separator=!previous?'':gap>Math.max(15,fragment.height*1.5)?'    ':gap>Math.min(previous.height,fragment.height)*.12?' ':'';
    result+=separator+fragment.text; previous=fragment;
  }
  return result.replace(/[ \t]+/g,match=>match.length>=3?'    ':' ').trim();
}
function gapAt(row: Row, split: number): number {
  const left=row.fragments.filter(item=>item.x+item.width<=split),right=row.fragments.filter(item=>item.x>=split);
  if(!left.length||!right.length||row.fragments.some(item=>item.x<split&&item.x+item.width>split))return 0;
  return right[0].x-Math.max(...left.map(item=>item.x+item.width));
}

/** Reconstructs visual rows, preserving table cells; only confident gutters are
 * read column-first. The editable source remains the authority for correction. */
export function cbtPdfPageText(items: CbtPdfFragment[], width: number, layout: CbtPdfLayout='auto'): {text:string;warnings:string[];columns:1|2} {
  if(!Number.isFinite(width)||width<=0)throw new Error('The PDF page has invalid dimensions.');
  const rows=rowsFromFragments(items), warnings:string[]=[];
  const lines=rows.map(row=>lineText(row.fragments));
  if(layout==='single'||layout==='auto'&&rows.length<3)return{text:lines.join('\n'),warnings,columns:1};
  // Answer tables and matching-column questions must keep their horizontal rows.
  const structuredTable=lines.some(line=>(line.match(/\b(?:Q(?:uestion)?\s*(?:No\.?|Number)?\s*(?:Key|Ans(?:wer)?s?)|Q\s*Key\s*Level)\b/gi)||[]).length>=2 || /\bColumn\s*(?:I|1|A)\b.*\bColumn\s*(?:II|2|B)\b/i.test(line));
  if(layout==='auto'&&structuredTable)return{text:lines.join('\n'),warnings,columns:1};
  const candidates=[.36,.4,.44,.48,.5,.52,.56,.6,.64].map(ratio=>{
    const split=width*ratio, separated=rows.filter(row=>gapAt(row,split)>=Math.max(24,width*.035));
    return{split,count:separated.length,score:separated.reduce((sum,row)=>sum+Math.min(gapAt(row,split),width*.14),0)};
  }).sort((a,b)=>b.count-a.count||b.score-a.score||Math.abs(a.split-width/2)-Math.abs(b.split-width/2));
  const best=candidates[0], confident=best.count>=Math.max(3,Math.ceil(rows.length*.42));
  if(layout==='auto'&&!confident){
    if(best.count>=3)warnings.push('Some wide PDF gaps were found, but a consistent column gutter was not clear. Check the extracted order or choose Two columns.');
    return{text:lines.join('\n'),warnings,columns:1};
  }
  const split=confident?best.split:width/2;
  warnings.push(layout==='auto'?'A two-column PDF layout was detected. Check the extracted reading order before parsing.':'Two-column reading order is selected. Check headings, tables and equations against the original PDF.');
  const output:string[]=[],left:CbtPdfFragment[][]=[],right:CbtPdfFragment[][]=[];
  const flush=()=>{output.push(...left.map(lineText),...right.map(lineText));left.length=0;right.length=0;};
  for(const row of rows){
    const crosses=row.fragments.some(item=>item.x<split&&item.x+item.width>split);
    const both=row.fragments.some(item=>item.x<split)&&row.fragments.some(item=>item.x>=split);
    if(crosses||both&&gapAt(row,split)<Math.max(20,width*.03)){flush();output.push(lineText(row.fragments));continue;}
    const a=row.fragments.filter(item=>item.x<split),b=row.fragments.filter(item=>item.x>=split);
    if(a.length)left.push(a);if(b.length)right.push(b);
  }
  flush();return{text:output.filter(Boolean).join('\n'),warnings,columns:2};
}

export type CbtPdfRange = { from: number; to: number };
export function validateCbtPdfRange(range: CbtPdfRange | undefined, pageCount: number): CbtPdfRange {
  const selected = range || { from: 1, to: pageCount };
  if (!Number.isInteger(selected.from) || !Number.isInteger(selected.to) || selected.from < 1 || selected.to < selected.from || selected.to > pageCount) throw new Error(`Choose a valid page range between 1 and ${pageCount}.`);
  return selected;
}
export async function readCbtPdf(file: File,onProgress?:(message:string)=>void,layout:CbtPdfLayout='auto',range?:CbtPdfRange):Promise<{text:string;warnings:string[];pageCount:number}> {
  if(!/\.pdf$/i.test(file.name)||file.size===0||file.size>MAX_FILE_SIZE)throw new Error('Choose a non-empty PDF smaller than 25 MB.');
  onProgress?.('Opening your PDF…');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw new Error('This file is not a valid PDF. Choose the original document.');
  const pdfjs=await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
  const task=pdfjs.getDocument({data:bytes,useSystemFonts:true}),pages:string[]=[],warnings=new Set<string>();
  let characters=0,empty=0;
  try{
    const pdf=await task.promise;
    if(pdf.numPages>1200)throw new Error('This PDF has more than 1,200 pages. Split it before importing.');
    const selected = validateCbtPdfRange(range, pdf.numPages);
    for(let pageNumber=selected.from;pageNumber<=selected.to;pageNumber++){
      onProgress?.(`Reading page ${pageNumber} of ${pdf.numPages}…`);
      const page=await pdf.getPage(pageNumber),viewport=page.getViewport({scale:1}),content=await page.getTextContent();
      const fragments:CbtPdfFragment[]=content.items.flatMap(item=>{
        if(!('str'in item)||!item.str.trim())return[];
        const[x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
        return[{text:item.str,x,y,width:Math.abs(item.width),height:Math.max(1,Math.abs(item.height))}];
      });
      const result=cbtPdfPageText(fragments,viewport.width,layout);
      if(!result.text.trim())empty++;else pages.push(`[Page ${pageNumber}]\n${result.text}`);
      result.warnings.forEach(warning=>warnings.add(warning));
      characters+=result.text.length;
      if(characters>4_000_000)throw new Error('This PDF contains too much text. Split it into smaller documents.');
      page.cleanup();
    }
    if(!pages.length)throw new Error('This PDF has no selectable text. Use OCR first, upload a text-layer PDF, or paste the recognized text. No questions or keys were inferred.');
    if(empty)warnings.add(`${empty} page${empty===1?' has':'s have'} no selectable text. Check the original for missing scanned content.`);
    warnings.add('Verify extracted equations, diagrams, table cells and answer labels against the original PDF.');
    return{text:pages.join('\n\n'),warnings:[...warnings],pageCount:pdf.numPages};
  }catch(error){if(error instanceof Error&&error.name==='PasswordException')throw new Error('This PDF is password protected. Upload an unlocked copy.');throw error;}
  finally{await task.destroy();}
}
