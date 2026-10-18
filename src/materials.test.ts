import {describe,it,expect} from 'vitest';
import {extractMaterial,materialKind,validateMaterial,splitTextSections,searchMaterial,speechChunks,MAX_FILE_SIZE} from './materials';
describe('uploaded material validation',()=>{
 it('recognizes supported file types without relying on a browser MIME type',()=>{expect(materialKind('LECTURE.PDF')).toBe('pdf');expect(materialKind('notes.docx')).toBe('docx');expect(materialKind('notes.md')).toBe('markdown');expect(materialKind('notes.txt')).toBe('text');expect(materialKind('script.html')).toBe(null);});
 it('rejects empty, oversized, and unsupported files',()=>{expect(()=>validateMaterial({name:'notes.pdf',size:0})).toThrow('empty');expect(()=>validateMaterial({name:'notes.pdf',size:MAX_FILE_SIZE+1})).toThrow('25 MB');expect(()=>validateMaterial({name:'old.doc',size:1})).toThrow('.docx');});
 it('extracts the original UTF-8 text without substituting content',async()=>{const content='Personal notes\n\nEnergy = शक्ति.\nReview on Monday.';const result=await extractMaterial(new File([content],'notes.txt'));expect(result.pages[0].text).toBe(content);expect(result.kind).toBe('text');expect(result.wordCount).toBe(8);});
 it('retains Markdown source as readable material',async()=>{const content='# My revision\n\n- Revisit $E=mc^2$.';const result=await extractMaterial(new File([content],'revision.md'));expect(result.pages[0].text).toBe(content);expect(result.kind).toBe('markdown');});
});
describe('reader search and speech',()=>{
 it('finds literal, case-insensitive matches across pages',()=>{expect(searchMaterial([{number:1,text:'E = mc^2. E = MC^2'},{number:2,text:'mc^2'}],'mc^2')).toEqual([{pageIndex:0,start:4,end:8},{pageIndex:0,start:14,end:18},{pageIndex:1,start:0,end:4}]);});
 it('handles regex syntax, empty queries and match limits safely',()=>{expect(searchMaterial([{number:1,text:'[x] and [x]'}],'[x]',1)).toHaveLength(1);expect(searchMaterial([{number:1,text:'[x]'}],' ')).toEqual([]);});
 it('splits lengthy text without dropping words',()=>{const text=Array.from({length:100},(_,i)=>`word${i}`).join(' ');expect(splitTextSections(text,70).map(p=>p.text).join(' ')).toBe(text);});
 it('creates bounded speech chunks and preserves source offsets',()=>{const text='A short sentence. '+ 'A long thought with many words. '.repeat(30);const chunks=speechChunks(text);expect(chunks.length).toBeGreaterThan(1);expect(chunks.every(c=>c.text===text.slice(c.start,c.end)&&c.text.length<=220)).toBe(true);expect(chunks.map(c=>c.text).join(' ').replace(/\s+/g,' ').trim()).toBe(text.trim());});
});
