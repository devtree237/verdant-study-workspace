import {describe,expect,it} from 'vitest';
import {calendarTextColor} from './calendar-appearance';
const luminance=(hex:string)=>{const c=hex.slice(1).match(/../g)!.map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
describe('solid calendar task label contrast',()=>{
 it('retains readable labels for every subject, personal and completed fill',()=>{
  for(const fill of ['#229767','#4e83df','#d68a3f','#9061d6','#7957d5','#7b8797']){const a=luminance(fill),b=luminance(calendarTextColor(fill));expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5);}
 });
 it('uses dark ink for light colors and white for dark colors',()=>{expect(calendarTextColor('#ffffff')).toBe('#101828');expect(calendarTextColor('#000000')).toBe('#ffffff');});
});
