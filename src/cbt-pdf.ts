import { MAX_FILE_SIZE } from './materials';
import { pdfPageText } from './pdf-text-layout';
import type { PdfTextLayout, PdfTextFragment } from './pdf-text-layout';

export type CbtPdfLayout = PdfTextLayout;
export type CbtPdfFragment = PdfTextFragment;
export const cbtPdfPageText = pdfPageText;

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
