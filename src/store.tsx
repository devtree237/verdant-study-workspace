import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createEmptyState, migrateStoredState, rollUpMastery, uid } from './model';
import type { State } from './model';
const KEY='verdant.workspace.v1';
type Notice = {id:string;message:string;undo?:()=>void};
type Store = {data:State;update:(fn:(s:State)=>State)=>void;notice:Notice|null;notify:(message:string,undo?:()=>void)=>void;dismiss:()=>void;storageError:boolean};
const StoreContext=createContext<Store>(null!);
export function Provider({children}:{children:ReactNode}) {
 const [data,setData]=useState<State>(()=>{try {const value=JSON.parse(localStorage.getItem(KEY)||'null'); if([1,2].includes(value?.version) && ['subjects','tasks','mistakes','folders','resources','assessments','focusLog'].every(k=>Array.isArray(value[k]))) {const migrated=migrateStoredState(value);if(value.version!==migrated.version)localStorage.setItem(KEY,JSON.stringify(migrated));return migrated;}}catch{/* Retain damaged data in storage until the first explicit edit. */} return createEmptyState();});
 const [notice,setNotice]=useState<Notice|null>(null); const [storageError,setStorageError]=useState(false); const dirty=useRef(false);
 const update=(fn:(s:State)=>State)=>{dirty.current=true;setData(s=>{const next=fn(s);return next.resources!==s.resources?{...next,folders:rollUpMastery(next.folders,next.resources)}:next;});};
 useEffect(()=>{if(!dirty.current)return;try{localStorage.setItem(KEY,JSON.stringify(data));setStorageError(false);}catch{setStorageError(true);}},[data]);
 useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(null),10000);return()=>clearTimeout(id);},[notice]);
 return <StoreContext.Provider value={{data,update,notice,notify:(message,undo)=>setNotice({id:uid(),message,undo}),dismiss:()=>setNotice(null),storageError}}>{children}</StoreContext.Provider>;
}
export const useStore=()=>useContext(StoreContext);
export async function fileStore(action:'put'|'get',key:string,file?:Blob):Promise<Blob|undefined>{
 return new Promise((resolve,reject)=>{const request=indexedDB.open('verdant-files',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('files',action==='put'?'readwrite':'readonly');const store=tx.objectStore('files');const op=action==='put'?store.put(file,key):store.get(key);let value:Blob|undefined;op.onsuccess=()=>{value=op.result;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};};});
}
