import{describe,expect,it}from'vitest';
import{cbtPdfPageText,type CbtPdfFragment}from'./cbt-pdf';
const item=(text:string,x:number,y:number,width=120,height=10):CbtPdfFragment=>({text,x,y,width,height});
describe('PDF CBT reading order',()=>{
  it('sorts unordered fragments into visual rows and keeps wide table-cell separators',()=>{
    const result=cbtPdfPageText([item('B',180,40,10),item('1',50,40,10),item('A',80,40,10),item('2',150,40,10),item('Header',50,20)],600,'single');
    expect(result.text).toBe('Header\n1    A    2    B');
  });
  it('detects two columns and reads each complete question before the next column',()=>{
    const fragments=[item('Question paper',50,15,500),...Array.from({length:5},(_,i)=>[item(i?'Left continuation '+i:'1. Left question',50,50+i*15,210),item(i?'Right continuation '+i:'2. Right question',340,50+i*15,210)]).flat(),item('Footer',50,150,500)];
    const result=cbtPdfPageText(fragments,600);
    expect(result.columns).toBe(2);
    expect(result.text.indexOf('Left continuation 4')).toBeLessThan(result.text.indexOf('2. Right question'));
    expect(result.text.split('\n')[0]).toBe('Question paper');
    expect(result.text.split('\n').at(-1)).toBe('Footer');
  });
  it('preserves repeated question/key table groups instead of reading each answer column separately',()=>{
    const fragments=[item('Q Key Level',50,20),item('Q Key Level',330,20),...Array.from({length:5},(_,i)=>[item(`${i+1} A M`,50,40+i*15),item(`${i+11} C H`,330,40+i*15)]).flat()];
    const result=cbtPdfPageText(fragments,600);
    expect(result.columns).toBe(1);expect(result.text.split('\n')[1]).toBe('1 A M    11 C H');
  });
  it('keeps matching-column question rows together in automatic mode',()=>{
    const fragments=[item('Column I',50,20),item('Column II',330,20),...Array.from({length:4},(_,i)=>[item(`Left ${i}`,50,40+i*15),item(`Right ${i}`,330,40+i*15)]).flat()];
    expect(cbtPdfPageText(fragments,600).columns).toBe(1);
  });
  it('does not split ordinary paragraphs at narrow inter-word spaces',()=>{
    const fragments=Array.from({length:8},(_,i)=>[item('The left text',50,30+i*15,230),item('continues on the same line',285,30+i*15,230)]).flat();
    const result=cbtPdfPageText(fragments,600);expect(result.columns).toBe(1);expect(result.text).toContain('The left text continues on the same line');
  });
  it('keeps smaller chemical subscripts and superscripts on the parent text line',()=>{
    const fragments=[item('H',50,30,7,10),item('3',57,34,4,6),item('O',61,30,7,10),item('+',68,26,4,6),item('in water',78,30,50,10),item('Next line',50,45,80,10)];
    const result=cbtPdfPageText(fragments,600,'single');
    expect(result.text).toBe('H₃O⁺ in water\nNext line');expect(result.warnings[0]).toContain('scientific notation');
  });
  it('offers manual column order without inventing content and ignores invalid geometry',()=>{
    const result=cbtPdfPageText([item('1. Left',50,40),item('2. Right',350,40),item('Left option',50,60),item('Right option',350,60),item('bad',NaN,0)],600,'two-column');
    expect(result.text).toBe('1. Left\nLeft option\n2. Right\nRight option');expect(result.warnings).toHaveLength(1);
    expect(()=>cbtPdfPageText([],NaN)).toThrow('dimensions');
  });
  it('keeps separate exponent digits and charge signs together without flattening their meaning',()=>{
    const fragments=[item('SO',40,40,14,12),item('4',54,44,4,8),item('2',58,35,4,8),item('−',62,35,4,8),item('is an ion',73,40,50,12)];
    expect(cbtPdfPageText(fragments,600,'single').text).toBe('SO₄²⁻ is an ion');
  });
  it('does not invent a fraction or convert a smaller ordinary line to a script',()=>{
    const fragments=[item('1',50,30,5,7),item('—',48,35,10,11),item('2',50,40,5,7),item('A small caption',50,60,90,8),item('Regular line',50,75,90,11)];
    expect(cbtPdfPageText(fragments,600,'single').text).toBe('1\n—\n2\nA small caption\nRegular line');
  });
  it('preserves scientific scripts inside each column without joining the two questions',()=>{
    const left=[item('1. H',45,30,25,12),item('2',70,34,4,8),item('O',74,30,8,12),item('(A) Water',45,50,100,12),item('(B) Other',45,70,100,12)];
    const right=[item('2. x',340,30,25,12),item('2',365,25,4,8),item('(A) Squared',340,50,100,12),item('(B) Other',340,70,100,12)];
    const result=cbtPdfPageText([...left,...right],600,'two-column');
    expect(result.text).toBe('1. H₂O\n(A) Water\n(B) Other\n2. x²\n(A) Squared\n(B) Other');
  });
});
