import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, deleteStoredValue, getStoredValue, setStoredValue } from './db';
afterEach(()=>vi.restoreAllMocks());
describe('durable write ordering',()=>{
 it('does not let a slow old write overtake a newer snapshot',async()=>{
  let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;}),committed:string[]=[];
  const put=vi.spyOn(db.records,'put').mockImplementation((row)=>Promise.resolve().then(async()=>{if(row.value==='old')await blocked;committed.push(row.value as string);return row.key;}) as ReturnType<typeof db.records.put>);
  const first=setStoredValue('queue-test','old'),second=setStoredValue('queue-test','new');
  await vi.waitFor(()=>expect(put).toHaveBeenCalledTimes(1));expect(committed).toEqual([]);release();await Promise.all([first,second]);expect(committed).toEqual(['old','new']);
 });
 it('allows a later save to recover after a failed write and reads only after it commits',async()=>{
  let value:unknown;vi.spyOn(db.records,'put').mockImplementation(row=>Promise.resolve().then(()=>{if(row.value==='failed')throw new Error('quota');value=row.value;return row.key;}) as ReturnType<typeof db.records.put>);
  vi.spyOn(db.records,'get').mockImplementation(()=>Promise.resolve({key:'recover-test',value,updatedAt:0}) as ReturnType<typeof db.records.get>);
  const failed=setStoredValue('recover-test','failed').catch(()=>{}),next=setStoredValue('recover-test','recovered');
  expect(await getStoredValue('recover-test')).toBe('recovered');await Promise.all([failed,next]);
 });
 it('serializes a delete after an in-flight save rather than resurrecting the record',async()=>{
  let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;}),operations:string[]=[];
  vi.spyOn(db.records,'put').mockImplementation(row=>blocked.then(()=>{operations.push('save');return row.key;}) as ReturnType<typeof db.records.put>);
  vi.spyOn(db.records,'delete').mockImplementation(()=>Promise.resolve().then(()=>{operations.push('delete');}) as ReturnType<typeof db.records.delete>);
  const save=setStoredValue('delete-test',{actual:'record'}),remove=deleteStoredValue('delete-test');release();await Promise.all([save,remove]);expect(operations).toEqual(['save','delete']);
 });
});
