import { pdfPageText } from './pdf-text-layout';
export type MaterialKind = 'pdf'|'docx'|'text'|'markdown'|'latex';
export type MaterialPage = {number:number;text:string};
export type ReadableMaterial = {version:1;name:string;kind:MaterialKind;pages:MaterialPage[];wordCount:number;warning?:string;latexPresentation?:1};
export type SearchMatch = {pageIndex:number;start:number;end:number};
export const MAX_FILE_SIZE=25*1024*1024;
export const MATERIAL_ACCEPT='.pdf,.tex,.docx,.txt,.md,.markdown,application/pdf,application/x-tex,text/x-tex,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';
export function materialKind(name:string):MaterialKind|null {
 const extension=name.toLowerCase().split('.').pop();return extension==='pdf'?'pdf':extension==='docx'?'docx':extension==='tex'?'latex':extension==='txt'?'text':extension==='md'||extension==='markdown'?'markdown':null;
}
export function validateMaterial(file:Pick<File,'name'|'size'>):MaterialKind {
 const kind=materialKind(file.name);
 if(!kind)throw new Error('Choose a PDF, LaTeX (.tex), Word (.docx), text (.txt), or Markdown (.md) file.');
 if(file.size>MAX_FILE_SIZE)throw new Error('Choose a file smaller than 25 MB.');
 if(file.size===0)throw new Error('This file is empty. Choose a document with some content.');
 return kind;
}
export function splitTextSections(text:string,max=12000):MaterialPage[]{
 const pages:MaterialPage[]=[];let remaining=text.replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim();
 while(remaining){let end=Math.min(max,remaining.length);if(end<remaining.length){const paragraph=remaining.lastIndexOf('\n',end);const word=remaining.lastIndexOf(' ',end);if(paragraph>max/2)end=paragraph;else if(word>max/2)end=word;}
 pages.push({number:pages.length+1,text:remaining.slice(0,end).trim()});remaining=remaining.slice(end).trim();}
 return pages.length?pages:[{number:1,text:''}];
}
export function searchMaterial(pages:MaterialPage[],query:string,limit=5000):SearchMatch[]{
 if(!query.trim())return [];const result:SearchMatch[]=[];const escaped=query.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const expression=new RegExp(escaped,'giu');
 for(let pageIndex=0;pageIndex<pages.length;pageIndex++){expression.lastIndex=0;let match;while((match=expression.exec(pages[pageIndex].text))){result.push({pageIndex,start:match.index,end:match.index+match[0].length});if(result.length>=limit)return result;}}
 return result;
}
export function speechChunks(text:string,max=220):{text:string;start:number;end:number}[]{
 const chunks=[];let start=0;
 while(start<text.length){while(/\s/.test(text[start]||'')&&start<text.length)start++;if(start>=text.length)break;let end=Math.min(start+max,text.length);if(end<text.length){const fragment=text.slice(start,end);const sentence=Math.max(fragment.lastIndexOf('. '),fragment.lastIndexOf('? '),fragment.lastIndexOf('! '));const word=fragment.lastIndexOf(' ');if(sentence>max*.3)end=start+sentence+1;else if(word>0)end=start+word;}
 chunks.push({text:text.slice(start,end),start,end});start=end;}
 return chunks;
}
export async function extractMaterial(file:File,onProgress?:(message:string)=>void):Promise<ReadableMaterial>{
 const kind=validateMaterial(file);onProgress?.('Reading your document…');let pages:MaterialPage[]=[];let warning:string|undefined;
 if(kind==='pdf'){
   const pdfjs=await import('pdfjs-dist');
   pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw new Error('This file is not a valid PDF. Choose the original PDF document.');
   const task=pdfjs.getDocument({data:bytes,useSystemFonts:true});
   try{
     const pdf=await task.promise;if(pdf.numPages>1200)throw new Error('This PDF has more than 1,200 pages. Split it into smaller documents first.');let characters=0;const layoutWarnings=new Set<string>();
     for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
       onProgress?.(`Reading page ${pageNumber} of ${pdf.numPages}…`);
       const page=await pdf.getPage(pageNumber);const viewport=page.getViewport({scale:1});const content=await page.getTextContent();
       const fragments=content.items.flatMap(item=>{if(!('str'in item)||!item.str.trim())return[];const[x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);return[{text:item.str,x,y,width:Math.abs(item.width),height:Math.max(1,Math.abs(item.height))}];});
       const extracted=pdfPageText(fragments,viewport.width);const text=extracted.text;
       extracted.warnings.forEach(message=>layoutWarnings.add(message));
       characters+=text.length;if(characters>4_000_000)throw new Error('This document contains too much text. Split it into smaller materials.');pages.push({number:pageNumber,text});page.cleanup();
     }
     const empty=pages.filter(p=>!p.text.trim()).length;
     if(empty)warning=empty===pages.length?'This PDF contains no selectable text. You can view the original, but search and read-aloud need a PDF with a text layer.':'Some pages contain no selectable text. Images and scanned pages are available in the original PDF; they cannot be searched or read aloud.';
     if(layoutWarnings.size)warning=[warning,...layoutWarnings].filter(Boolean).join(' ');
   }catch(error){if(error instanceof Error&&error.name==='PasswordException')throw new Error('This PDF is password protected. Upload an unlocked copy to read it here.');throw error;}finally{await task.destroy();}
 }else{
   let text='';
   if(kind==='docx'){
     onProgress?.('Extracting text from your Word document…');
     try{const mammoth=await import('mammoth');const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});text=result.value;}catch{throw new Error('This Word document could not be read. Save it as a .docx file and upload it again.');}
     warning='Text view preserves the words in your document. Download the original for its full formatting, equations, and images.';
   }else{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}
   if(text.length>4_000_000)throw new Error('This file contains too much text. Split it into smaller materials.');
   if(kind==='latex'){const {latexResourceToMarkdown}=await import('./resource-latex');text=latexResourceToMarkdown(text);warning='The reader displays LaTeX text and equations. The original download preserves the complete source.';}
   pages=splitTextSections(text);if(!text.trim())warning='No readable text was found in this file. You can still download the original.';
 }
 return {version:1,name:file.name,kind,pages,wordCount:pages.reduce((sum,p)=>sum+(p.text.trim()?p.text.trim().split(/\s+/u).length:0),0),warning,...(kind==='latex'?{latexPresentation:1 as const}:{})};
}
