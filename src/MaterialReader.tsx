import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, ExternalLink, Pause, Play, Search, Square, Volume2 } from 'lucide-react';
import type { Resource } from './model';
import { extractMaterial, searchMaterial, speechChunks } from './materials';
import type { ReadableMaterial } from './materials';
import { fileStore } from './store';
import { duration, gsap, useGSAP, Markdown } from './ui';
import './reader-workspace.css';
const PdfReader=lazy(()=>import('./PdfReader').then(module=>({default:module.PdfReader})));


function markedText(text:string, ranges:{start:number;end:number;active?:boolean}[], spoken:{start:number;end:number}|null):ReactNode[] {
  const boundaries=new Set([0,text.length]);
  for(const r of ranges){boundaries.add(r.start);boundaries.add(r.end);}
  if(spoken){boundaries.add(spoken.start);boundaries.add(spoken.end);}
  const positions=[...boundaries].sort((a,b)=>a-b);
  return positions.slice(0,-1).map((start,i)=>{
    const end=positions[i+1], match=ranges.find(r=>start>=r.start&&end<=r.end);
    const speaking=spoken&&start>=spoken.start&&end<=spoken.end;
    const content=text.slice(start,end);
    return match?<mark key={start} className={match.active?'search-match active':'search-match'} data-active-match={match.active||undefined}>{content}</mark>:speaking?<span key={start} className="spoken-text">{content}</span>:content;
  });
}

export function MaterialReader({resource,onCapture}:{resource:Resource;onCapture:(text:string)=>void}) {
  const [material,setMaterial]=useState<ReadableMaterial|null>(null);
  const [progress,setProgress]=useState('Opening your material…');
  const [error,setError]=useState('');
  const [url,setUrl]=useState('');
  const [blob,setBlob]=useState<Blob|null>(null);
  const [query,setQuery]=useState('');
  const [matchIndex,setMatchIndex]=useState(0);
  const [pageIndex,setPageIndex]=useState(0);
  const [view,setView]=useState<'text'|'original'>(resource.type==='PDF'?'original':'text');
  const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI,setVoiceURI]=useState('');
  const [rate,setRate]=useState(1);
  const [speechState,setSpeechState]=useState<'idle'|'playing'|'paused'>('idle');
  const [speechError,setSpeechError]=useState('');
  const [spoken,setSpoken]=useState<{pageIndex:number;start:number;end:number}|null>(null);
  const ref=useRef<HTMLDivElement>(null);
  const textRef=useRef<HTMLDivElement>(null);
  const speechToken=useRef(0);
  const utterance=useRef<SpeechSynthesisUtterance|null>(null);
  const speechAvailable=typeof window!=='undefined'&&'speechSynthesis' in window;
  const matches=useMemo(()=>searchMaterial(material?.pages||[],query),[material,query]);
  const page=material?.pages[pageIndex];
  const isPDF=resource.type==='PDF';
  const pageLabel=isPDF?'Page':'Section';

  useEffect(()=>{
    let active=true, objectURL='';
    async function load(){
      setError('');
      try{
        if(!resource.fileKey)throw new Error('No file is attached. Choose Edit resource to upload your material.');
        const blob=await fileStore('get',resource.fileKey);
        if(!blob)throw new Error('This file is not stored in this browser. Upload it again from Edit resource.');
        if(!active)return;
        objectURL=URL.createObjectURL(blob);setUrl(objectURL);setBlob(blob);
        if(isPDF&&view==='original'){setProgress('');return;}
        const cached=await fileStore('get',resource.fileKey+':reader');
        let parsed:ReadableMaterial|null=null;
        if(cached){try{const value=JSON.parse(await cached.text());if(value.version===1&&Array.isArray(value.pages))parsed=value;}catch{/* Rebuild the cache from the original. */}}
        if(!parsed){
          parsed=await extractMaterial(new File([blob],resource.fileName||resource.title+(isPDF?'.pdf':'.txt'),{type:blob.type}),message=>{if(active)setProgress(message);});
          await fileStore('put',resource.fileKey+':reader',new Blob([JSON.stringify(parsed)],{type:'application/json'})).catch(()=>{});
        }
        if(active){setMaterial(parsed);setProgress('');}
      }catch(e){if(active){setError(e instanceof Error?e.message:'Unable to read this file. Try uploading it again.');setProgress('');}}
    }
    void load();
    return()=>{active=false;if(objectURL)URL.revokeObjectURL(objectURL);};
  },[resource.fileKey,resource.fileName,resource.title,isPDF,view]);

  useEffect(()=>{
    if(!speechAvailable)return;
    const refresh=()=>setVoices(window.speechSynthesis.getVoices().filter(voice=>voice.localService));
    refresh();window.speechSynthesis.addEventListener('voiceschanged',refresh);
    return()=>{speechToken.current++;window.speechSynthesis.cancel();window.speechSynthesis.removeEventListener('voiceschanged',refresh);};
  },[speechAvailable]);

  useGSAP(()=>{
    if(textRef.current)gsap.fromTo(textRef.current,{opacity:0,y:8},{opacity:1,y:0,duration:duration(.22)});
  },{scope:ref,dependencies:[pageIndex,view,!!material],revertOnUpdate:true});

  useEffect(()=>{const container=textRef.current;const match=container?.querySelector('[data-active-match]');if(container&&match){const bounds=container.getBoundingClientRect();const target=match.getBoundingClientRect();if(target.top<bounds.top+24||target.bottom>bounds.bottom-24)container.scrollTop+=target.top-bounds.top-60;}},[matchIndex,pageIndex,matches,view]);

  function stop(){
    speechToken.current++;utterance.current=null;
    if(speechAvailable)window.speechSynthesis.cancel();
    setSpeechState('idle');setSpoken(null);
  }
  function navigate(index:number){stop();setPageIndex(index);}
  function find(value:string){
    stop();setQuery(value);setMatchIndex(0);setView('text');
    const first=searchMaterial(material?.pages||[],value,1)[0];if(first)setPageIndex(first.pageIndex);
  }
  function moveMatch(offset:number){
    if(!matches.length)return;
    stop();const index=(matchIndex+offset+matches.length)%matches.length;setMatchIndex(index);setPageIndex(matches[index].pageIndex);setView('text');
  }
  function read(){
    if(!material||!speechAvailable||!voices.length)return;
    stop();setSpeechError('');setView('text');setSpeechState('playing');
    const token=speechToken.current;
    const voice=voices.find(v=>v.voiceURI===voiceURI)||voices.find(v=>v.default)||voices[0];
    const queue=material.pages.slice(pageIndex).flatMap((p,i)=>speechChunks(p.text).map(chunk=>({...chunk,pageIndex:pageIndex+i})));
    function say(index:number){
      if(token!==speechToken.current)return;
      const chunk=queue[index];
      if(!chunk){setSpeechState('idle');setSpoken(null);utterance.current=null;return;}
      const speech=new SpeechSynthesisUtterance(chunk.text);utterance.current=speech;speech.voice=voice;speech.lang=voice.lang;speech.rate=rate;
      speech.onstart=()=>{if(token===speechToken.current){setPageIndex(chunk.pageIndex);setSpoken(chunk);}};
      speech.onend=()=>say(index+1);
      speech.onerror=event=>{if(token===speechToken.current){setSpeechState('idle');setSpoken(null);if(event.error!=='canceled'&&event.error!=='interrupted')setSpeechError('Read-aloud could not start. Select another installed voice or try again.');}};
      window.speechSynthesis.speak(speech);
    }
    say(0);
  }
  function togglePause(){
    if(speechState==='paused'){window.speechSynthesis.resume();setSpeechState('playing');}
    else {window.speechSynthesis.pause();setSpeechState('paused');}
  }
  function capture(){
    const selection=window.getSelection();
    if(selection?.rangeCount&&textRef.current?.contains(selection.getRangeAt(0).commonAncestorContainer)){
      const text=selection.toString().trim();if(text)onCapture(text);
    }
  }

  if(isPDF&&view==='original'&&blob)return <section className="material-reader material-reader-pdf"><div className="reader-mode-actions"><span>PDF workspace</span><button className="button secondary small" onClick={()=>setView('text')}><Volume2 size={14}/>Text & read aloud</button></div><Suspense fallback={<p role="status" className="reader-hint">Opening your PDF workspace…</p>}><PdfReader resource={resource} blob={blob} onCapture={onCapture}/></Suspense></section>;
  return <section className="material-reader" ref={ref} aria-label="Material reader">
    {isPDF&&blob&&<div className="reader-mode-actions"><span>Text & read aloud</span><button className="button secondary small" onClick={()=>{stop();setView('original');}}><ChevronLeft size={14}/>PDF workspace</button></div>}
    <div className="reader-file-heading"><div><b>{resource.fileName||resource.title}</b><span>{material?`${material.wordCount.toLocaleString()} words · ${material.pages.length} ${isPDF?'pages':'sections'}`:progress}</span></div>{url&&<a className="icon-btn" href={url} download={resource.fileName||resource.title} aria-label="Download original material" title="Download original"><Download size={17}/></a>}</div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {material&&<>
      <div className="reader-search"><Search size={16}/><input type="search" value={query} onChange={e=>find(e.target.value)} placeholder="Find in this material…" aria-label="Search material text" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();moveMatch(e.shiftKey?-1:1);}}}/><span aria-live="polite">{query.trim()?matches.length?`${matchIndex+1} / ${matches.length}${matches.length===5000?'+':''}`:'No matches':''}</span><button className="icon-btn" aria-label="Previous search result" disabled={!matches.length} onClick={()=>moveMatch(-1)}><ArrowUp size={15}/></button><button className="icon-btn" aria-label="Next search result" disabled={!matches.length} onClick={()=>moveMatch(1)}><ArrowDown size={15}/></button></div>
      <div className="reader-speech"><div className="reader-speech-actions">{speechState==='idle'?<button className="button secondary small" onClick={read} disabled={!material.wordCount||!voices.length}><Volume2 size={15}/>Read aloud</button>:<><button className="button secondary small" onClick={togglePause}>{speechState==='paused'?<Play size={15}/>:<Pause size={15}/>} {speechState==='paused'?'Resume':'Pause'}</button><button className="icon-btn" aria-label="Stop reading" onClick={stop}><Square size={14}/></button></>}<select aria-label="Reading speed" value={rate} onChange={e=>{stop();setRate(Number(e.target.value));}}>{[.75,1,1.25,1.5,2].map(speed=><option key={speed} value={speed}>{speed}× speed</option>)}</select></div>{voices.length>0&&<select className="reader-voice" aria-label="Reading voice" value={voiceURI} onChange={e=>{stop();setVoiceURI(e.target.value);}}><option value="">Default device voice</option>{voices.map(voice=><option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select>}</div>
      {!speechAvailable?<p className="reader-hint">Read-aloud is not supported in this browser. Open the app in Edge or Chrome to use a device voice.</p>:!voices.length&&<p className="reader-hint">No local reading voice is available. Install a speech voice in your device settings, then reopen the app in Edge or Chrome.</p>}
      {speechError&&<p className="form-error" role="alert">{speechError}</p>}
      {material.warning&&<p className="reader-hint">{material.warning}</p>}
      <div className="reader-navigation"><div className="reader-view-switch" role="group" aria-label="Document view"><button className={view==='text'?'active':''} onClick={()=>setView('text')}>Text reader</button>{isPDF&&<button className={view==='original'?'active':''} onClick={()=>{stop();setView('original');}}>Original PDF</button>}</div><div className="reader-pages"><button className="icon-btn" aria-label="Previous page" disabled={pageIndex===0} onClick={()=>navigate(pageIndex-1)}><ChevronLeft size={16}/></button><label>{pageLabel}<select aria-label={`Go to ${pageLabel.toLowerCase()}`} value={pageIndex} onChange={e=>navigate(Number(e.target.value))}>{material.pages.map((p,i)=><option key={p.number} value={i}>{p.number}</option>)}</select><span>of {material.pages.length}</span></label><button className="icon-btn" aria-label="Next page" disabled={pageIndex===material.pages.length-1} onClick={()=>navigate(pageIndex+1)}><ChevronRight size={16}/></button></div></div>
      {view==='text'?<div className="reader-page" ref={textRef} tabIndex={0} aria-label={`${pageLabel} ${pageIndex+1} text`} onMouseUp={capture} onKeyUp={e=>{if(e.key==='Shift')capture();}}><span className="reader-page-label">{pageLabel.toUpperCase()} {pageIndex+1}</span>{page?.text?<div className="reader-text">{material?.kind==='latex'&&!query&&!spoken?<Markdown>{page.text}</Markdown>:markedText(page.text,matches.map((m,i)=>({...m,active:i===matchIndex})).filter(m=>m.pageIndex===pageIndex),spoken?.pageIndex===pageIndex?spoken:null)}</div>:<p className="reader-hint">No readable text on this {pageLabel.toLowerCase()}. {isPDF?'Open the original PDF to view this page.':''}</p>}</div>:<p className="reader-hint" role="status">Opening the PDF workspace…</p>}
      <p className="reader-hint reader-bottom-hint">Select text to copy it into Quick capture. Read-aloud starts on the current {pageLabel.toLowerCase()} and continues through the document.</p>
    </>}
    {url&&isPDF&&<a className="reader-original-link" href={`${url}#page=${pageIndex+1}`} target="_blank" rel="noreferrer">Open original PDF in a new tab<ExternalLink size={13}/></a>}
  </section>;
}
