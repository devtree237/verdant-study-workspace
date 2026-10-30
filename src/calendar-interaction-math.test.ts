import {describe,expect,it} from 'vitest';
import {resizeCalendarEdge,timedMoveDurationMs} from './components/ui/reui-event-calendar-utils/event-calendar-interaction-math';

const minute=60000;
const at=(hours:number,minutes=0)=>new Date(2026,9,30,hours,minutes).getTime();
describe('calendar drag conversion and resize boundaries',()=>{
  it('places an untimed 25-minute task using its planned duration rather than its 24-hour layout envelope',()=>{
    expect(timedMoveDurationMs(true,24*60*minute,25,30)).toBe(25*minute);
    expect(timedMoveDurationMs(true,24*60*minute,undefined,30)).toBe(30*minute);
  });
  it('retains measured clock spacing when moving an already timed item',()=>{
    expect(timedMoveDurationMs(false,47*minute,25,30)).toBe(47*minute);
    for(const invalid of [NaN,Infinity,0,-10]) expect(timedMoveDurationMs(true,24*60*minute,invalid,30)).toBe(30*minute);
  });
  it('extends the top upward without moving the existing end',()=>{
    expect(resizeCalendarEdge(at(9),at(10),'start',-15,at(0),at(24),15)).toEqual({start:at(8,45),end:at(10)});
  });
  it('extends the bottom downward without moving the existing start',()=>{
    expect(resizeCalendarEdge(at(9),at(10),'end',15,at(0),at(24),15)).toEqual({start:at(9),end:at(10,15)});
  });
  it('clamps both handles to the visible day and prevents crossing the opposite edge',()=>{
    expect(resizeCalendarEdge(at(0,5),at(1),'start',-15,at(0),at(24),15)).toEqual({start:at(0),end:at(1)});
    expect(resizeCalendarEdge(at(23),at(23,55),'end',15,at(0),at(24),15)).toEqual({start:at(23),end:at(24)});
    expect(resizeCalendarEdge(at(9),at(10),'start',90,at(0),at(24),15)).toEqual({start:at(9,45),end:at(10)});
    expect(resizeCalendarEdge(at(9),at(10),'end',-90,at(0),at(24),15)).toEqual({start:at(9),end:at(9,15)});
  });
  it('keeps a short real task from jumping backward when its shrink handle reaches the minimum',()=>{
    expect(resizeCalendarEdge(at(9),at(9,5),'start',15,at(0),at(24),15)).toBeNull();
    expect(resizeCalendarEdge(at(9),at(9,5),'end',-15,at(0),at(24),15)).toBeNull();
    expect(resizeCalendarEdge(at(9),at(9,5),'end',15,at(0),at(24),15)).toEqual({start:at(9),end:at(9,20)});
  });
  it('ignores damaged or unchanged resize proposals',()=>{
    expect(resizeCalendarEdge(at(9),at(9),'end',15,at(0),at(24),15)).toBeNull();
    expect(resizeCalendarEdge(at(9),at(10),'end',NaN,at(0),at(24),15)).toBeNull();
    expect(resizeCalendarEdge(at(9),at(10),'end',0,at(0),at(24),15)).toBeNull();
  });
});
