import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore as useZustand } from 'zustand';
import { createEmptyState, rollUpMastery, uid, validateWorkspaceState } from './model';
import type { State } from './model';
import { getStoredValue, setStoredValue, WORKSPACE_STORAGE_KEY } from './db';
import { archiveCompletedTasks } from './task-history';
type Notice = {id:string;message:string;undo?:()=>void};
type Store = {data:State;update:(fn:(s:State)=>State)=>void;notice:Notice|null;notify:(message:string,undo?:()=>void)=>void;dismiss:()=>void;storageError:boolean;storageMessage:string};
type LiveState = {data:State;notice:Notice|null;storageError:boolean;storageMessage:string};
const StoreContext=createContext<Store>(null!);
export function Provider({children}:{children:ReactNode}) {
 const [live]=useState(()=>createStore<LiveState>(()=>({data:createEmptyState(),notice:null,storageError:false,storageMessage:''})));
 const state=useZustand(live,value=>value);
 const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[retry,setRetry]=useState(0);
 const rawBackup=useRef<unknown>(null),canPersist=useRef(false),generation=useRef(0);
 useEffect(()=>{
  const token=++generation.current;setLoading(true);setLoadError('');canPersist.current=false;
  void (async()=>{
   let stored:unknown,readFailed=false;
   try{stored=await getStoredValue<unknown>(WORKSPACE_STORAGE_KEY);}catch{readFailed=true;}
   if(token!==generation.current)return;
   let loaded:State;
   if(stored!==undefined){rawBackup.current=stored;loaded=validateWorkspaceState(stored);}
   else {
    let legacy:string|null=null;
    try{legacy=localStorage.getItem(WORKSPACE_STORAGE_KEY);}catch{if(readFailed)throw new Error('Browser storage could not be opened. Your saved copies have not been changed.');}
    rawBackup.current=legacy;
    if(legacy){try{loaded=validateWorkspaceState(JSON.parse(legacy));}catch(error){throw new Error('Your saved workspace could not be read. '+(error instanceof Error?error.message:''));}}
    else loaded=createEmptyState();
   }
   loaded=archiveCompletedTasks(loaded);
   let storageError=readFailed,storageMessage=readFailed?'IndexedDB could not be opened. This session is in memory; export changes before leaving. The older saved copy is retained.':'';
   if(!readFailed){
    canPersist.current=true;
    try{await setStoredValue(WORKSPACE_STORAGE_KEY,loaded);}catch{storageError=true;storageMessage='The workspace opened, but IndexedDB could not save it. Keep this tab open and export your work before leaving.';}
   }
   if(token!==generation.current)return;
   live.setState({data:loaded,storageError,storageMessage});setLoading(false);
  })().catch(error=>{if(token===generation.current){setLoadError(error instanceof Error?error.message:'The saved workspace could not be opened.');setLoading(false);}});
  return()=>{generation.current++;};
 },[live,retry]);
 const update=useCallback((fn:(s:State)=>State)=>{
  const previous=live.getState().data,candidate=fn(previous);
  if(candidate===previous)return;
  const next=archiveCompletedTasks(candidate.resources!==previous.resources?{...candidate,folders:rollUpMastery(candidate.folders,candidate.resources)}:candidate);
  live.setState({data:next});
  if(!canPersist.current){live.setState({storageError:true,storageMessage:'Changes are only in memory because storage could not be read safely. Export this workspace before leaving.'});return;}
  void setStoredValue(WORKSPACE_STORAGE_KEY,next).then(()=>live.setState({storageError:false,storageMessage:''})).catch(()=>live.setState({storageError:true,storageMessage:'IndexedDB could not save these changes. Keep this tab open and export your workspace before leaving.'}));
 },[live]);
 useEffect(()=>{if(!state.notice)return;const id=setTimeout(()=>live.setState({notice:null}),10000);return()=>clearTimeout(id);},[live,state.notice]);
 function downloadBackup(){const raw=rawBackup.current;if(raw===null||raw===undefined)return;const url=URL.createObjectURL(new Blob([typeof raw==='string'?raw:JSON.stringify(raw,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='verdant-workspace-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 if(loading)return <div className="workspace-loading" role="status" style={{minHeight:'100dvh',display:'grid',placeContent:'center',gap:12,textAlign:'center',background:'var(--canvas)',color:'var(--text-primary)'}}><b>Opening your workspace…</b><span>Your saved tasks and materials are being loaded.</span></div>;
 if(loadError)return <div role="alert" className="workspace-loading" style={{minHeight:'100dvh',display:'grid',placeContent:'center',gap:16,padding:30,background:'var(--canvas)',color:'var(--text-primary)'}}><h1>We could not open your saved workspace</h1><p style={{maxWidth:620,lineHeight:1.8}}>{loadError} The original stored copy has been retained.</p><div style={{display:'flex',gap:10}}><button className="button primary" onClick={()=>setRetry(value=>value+1)}>Try again</button>{rawBackup.current!==null&&<button className="button secondary" onClick={downloadBackup}>Download saved copy</button>}</div></div>;
 return <StoreContext.Provider value={{...state,update,notify:(message,undo)=>live.setState({notice:{id:uid(),message,undo}}),dismiss:()=>live.setState({notice:null})}}>{children}</StoreContext.Provider>;
}
export const useStore=()=>useContext(StoreContext);
function legacyFile(key:string):Promise<Blob|undefined>{
 return new Promise((resolve,reject)=>{const request=indexedDB.open('verdant-files',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const old=request.result;const tx=old.transaction('files','readonly'),op=tx.objectStore('files').get(key);let value:Blob|undefined;op.onsuccess=()=>{value=op.result;};tx.oncomplete=()=>{old.close();resolve(value);};tx.onerror=()=>{old.close();reject(tx.error);};};});
}
export async function fileStore(action:'put'|'get',key:string,file?:Blob):Promise<Blob|undefined>{
 const storedKey='file:'+key;
 if(action==='put'){if(!(file instanceof Blob))throw new Error('Choose a valid file to save.');await setStoredValue(storedKey,file);return file;}
 let failure:unknown,stored:Blob|undefined,readSucceeded=false;
 try{stored=await getStoredValue<Blob>(storedKey);readSucceeded=true;}catch(error){failure=error;}
 if(stored!==undefined){if(!(stored instanceof Blob))throw new Error('The saved file is damaged. Its stored copy has been retained.');return stored;}
 const legacy=await legacyFile(key);if(legacy){if(readSucceeded){try{await setStoredValue(storedKey,legacy);}catch{/* The original remains in native IndexedDB. */}}return legacy;}
 if(failure)throw failure;
 return undefined;
}
