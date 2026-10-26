import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Brain, Check, FileText, Plus, Upload, X } from 'lucide-react';
import type { Resource, Question } from './model';
import { day, uid } from './model';
import { extractMaterial, MATERIAL_ACCEPT } from './materials';
import type { ReadableMaterial } from './materials';
import { fileStore, useStore } from './store';
import { Modal } from './ui';

export function ResourceForm({resource,folder,initialUpload=false,onClose}:{resource?:Resource;folder:string|null;initialUpload?:boolean;onClose:()=>void}) {
  const {data,update,notify}=useStore();
  const [title,setTitle]=useState(resource?.title||'');
  const [type,setType]=useState<Resource['type']>(resource?.type||(initialUpload?'Document':'Note'));
  const [folderId,setFolderId]=useState(resource?.folder??folder??data.folders.find(f=>f.parent)?.id??data.folders[0]?.id??'');
  const [unfiledSubject,setUnfiledSubject]=useState(resource?.subject||data.subjects[0]?.id||'');
  const [content,setContent]=useState(resource?.content||'');
  const [url,setUrl]=useState(resource?.url||'');
  const [file,setFile]=useState<File|null>(null);
  const [parsed,setParsed]=useState<ReadableMaterial|null>(null);
  const [questions,setQuestions]=useState<Question[]>(resource?.questions||[]);
  const [error,setError]=useState('');
  const [progress,setProgress]=useState('');
  const [saving,setSaving]=useState(false);
  const [dragging,setDragging]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const sequence=useRef(0);
  const upload=type==='PDF'||type==='Document';
  useEffect(()=>()=>{sequence.current++;},[]);

  async function chooseFile(selected:File){
    const token=++sequence.current;setError('');setProgress('Opening your file…');
    try{
      const document=await extractMaterial(selected,message=>{if(token===sequence.current)setProgress(message);});
      if(token!==sequence.current)return;
      setFile(selected);setParsed(document);setType(document.kind==='pdf'?'PDF':'Document');
      setTitle(current=>current||selected.name.replace(/\.[^.]+$/,''));
    }catch(e){if(token===sequence.current)setError(e instanceof Error?e.message:'This file could not be read. Try another document.');}
    finally{if(token===sequence.current)setProgress('');}
  }
  function questionChange(i:number,key:keyof Question,value:string|number|string[]){setQuestions(q=>q.map((x,n)=>n===i?{...x,[key]:value}:x));}
  async function save(e:React.FormEvent){
    e.preventDefault();if(progress||saving)return;
    const subject=data.subjects.find(s=>s.id===folderId);
    const destination=data.folders.find(f=>f.id===folderId)||(!data.folders.length&&subject?{id:uid(),name:subject.name,subject:subject.id,parent:null,pinned:false,mastery:0}:undefined);
    const unfiled=folderId==='';
    if(!title.trim()||(!unfiled&&!destination)){setError('Add a title and choose a folder or Unfiled.');return;}
    if(unfiled&&!data.subjects.some(item=>item.id===unfiledSubject)){setError('Choose a subject for this unfiled material.');return;}
    if(type==='Link'&&!/^https?:\/\//i.test(url)){setError('Use a complete https:// or http:// web address.');return;}
    if(upload&&!file&&!resource?.fileKey){setError('Choose a PDF, LaTeX, Word document, text, or Markdown file to upload.');return;}
    if(type==='Quiz'&&!questions.length){setError('Add at least one practice question for your quiz.');return;}
    if(questions.some(q=>!q.prompt.trim()||q.options.length<2||q.options.some(x=>!x.trim())||q.answer>=q.options.length)){setError('Each question needs a prompt, at least two answers, and a valid correct answer.');return;}
    setSaving(true);setError('');
    try{
      let fileKey=resource?.fileKey;
      if(upload&&file&&parsed){
        fileKey=uid();
        await fileStore('put',fileKey,file);
        await fileStore('put',fileKey+':reader',new Blob([JSON.stringify(parsed)],{type:'application/json'}));
      }
      const kind=parsed?.kind||resource?.fileKind||(resource?.type==='PDF'?'pdf':undefined);
      const item:Resource={id:resource?.id||uid(),title:title.trim(),type:upload?(kind==='pdf'?'PDF':'Document'):type,folder:unfiled?'':destination!.id,subject:unfiled?unfiledSubject:destination!.subject,content,url:type==='Link'?url:undefined,fileKey:upload?fileKey:undefined,fileName:upload?(file?.name||resource?.fileName):undefined,fileSize:upload?(file?.size||resource?.fileSize):undefined,fileKind:upload?kind:undefined,pageCount:upload?(parsed?.pages.length||resource?.pageCount):undefined,questions:questions.length?questions:undefined,mastery:resource?.mastery||0,pinned:resource?.pinned||false,updated:day()};
      update(s=>({...s,folders:!destination||s.folders.some(f=>f.id===destination.id)?s.folders:[...s.folders,destination],resources:resource?s.resources.map(r=>r.id===resource.id?item:r):[item,...s.resources]}));
      notify(resource?'Resource updated':'Material saved. Open it to search and read aloud.');onClose();
    }catch{setError('Your browser could not save the file. Free some device storage and try again.');setSaving(false);}
  }

  return <Modal title={resource?'Edit study material':initialUpload?'Upload your study material':'Add to your resource vault'} onClose={onClose} wide>
    <form onSubmit={save}><div className="modal-body space-y-4">
      <div className={`material-upload ${dragging?'dragging':''} ${file?'has-file':''}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);if(saving)return;const selected=e.dataTransfer.files[0];if(selected)void chooseFile(selected);}}>
        <span className="material-upload-icon">{file?<Check size={23}/>:<Upload size={23}/>}</span>
        <div><b>{file?.name||resource?.fileName||'Bring your own study material'}</b><p>{progress|| (parsed?`${parsed.wordCount.toLocaleString()} words ready · ${parsed.pages.length} ${parsed.kind==='pdf'?'pages':'sections'}`:'PDF, LaTeX (.tex), Word (.docx), TXT, or Markdown · up to 25 MB')}</p></div>
        <button type="button" className="button secondary small" disabled={saving||!!progress} onClick={()=>input.current?.click()}>{file||resource?.fileKey?'Replace file':'Choose file'}</button>
        <input ref={input} className="sr-only" type="file" accept={MATERIAL_ACCEPT} aria-label="Upload study material" disabled={saving||!!progress} onChange={e=>{const selected=e.target.files?.[0];if(selected)void chooseFile(selected);e.target.value='';}}/>
      </div>
      {progress&&<p className="reader-hint" role="status">{progress}</p>}
      {parsed?.warning&&<p className="reader-hint">{parsed.warning}</p>}
      <label>Resource title<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Give this material a name"/></label>
      <div className="form-grid"><label>Format<select value={upload?'Upload':type} onChange={e=>setType(e.target.value==='Upload'?'Document':e.target.value as Resource['type'])} disabled={!!progress}><option value="Upload">Uploaded material</option><option>Note</option><option>Link</option><option>Quiz</option></select></label><label>Folder<select value={folderId} onChange={e=>setFolderId(e.target.value)}><option value="">Unfiled · All resources</option>{!data.folders.length&&data.subjects.map(s=><option key={s.id} value={s.id}>{s.name} / New resource folder</option>)}{data.folders.map(f=><option key={f.id} value={f.id}>{data.folders.find(p=>p.id===f.parent)?.name}{f.parent?' / ':''}{f.name}</option>)}</select></label></div>
      {folderId===''&&<label>Subject for unfiled material<select value={unfiledSubject} onChange={event=>setUnfiledSubject(event.target.value)}><option value="" disabled>Choose a subject</option>{data.subjects.map(subject=><option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>}
      {type==='Link'&&<label>Web or video URL<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…" required/></label>}
      {upload&&<p className="reader-hint"><FileText size={14}/> Files and extracted text are saved in this browser. Open the saved material to read, search, and listen with a device voice.</p>}
      <label>{type==='Note'?'Notes · Markdown & $LaTeX$ supported':upload?'Your study notes · optional':'Description'}<textarea rows={type==='Note'?7:3} value={content} onChange={e=>setContent(e.target.value)} placeholder={type==='Note'?'# Start with an idea…':'Add a note or a question to explore…'}/></label>
      <details className="question-builder" open={type==='Quiz'}><summary><Brain size={16}/>Practice questions ({questions.length})</summary><p className="text-xs text-slate-500 mt-3 mb-4">Add your own self-check questions. Assessments use only the questions you add here.</p>{questions.map((q,i)=><div className="question-editor" key={i}><div className="flex items-center justify-between"><b className="text-sm">Question {i+1}</b><button type="button" className="icon-btn" aria-label={`Remove question ${i+1}`} onClick={()=>setQuestions(questions.filter((_,n)=>n!==i))}><X size={14}/></button></div><label>Prompt<textarea rows={2} value={q.prompt} onChange={e=>questionChange(i,'prompt',e.target.value)}/></label><label>Answer choices · one per line<textarea rows={4} value={q.options.join('\n')} onChange={e=>questionChange(i,'options',e.target.value.split('\n'))}/></label><div className="form-grid"><label>Correct answer<select value={q.answer} onChange={e=>questionChange(i,'answer',Number(e.target.value))}>{q.options.map((o,j)=><option key={j} value={j}>{j+1}. {o}</option>)}</select></label><label>Explanation<input value={q.explanation} onChange={e=>questionChange(i,'explanation',e.target.value)}/></label></div></div>)}<button type="button" className="button secondary small" onClick={()=>setQuestions([...questions,{prompt:'',options:['','','',''],answer:0,explanation:''}])}><Plus size={14}/>Add question</button></details>
      {error&&<p className="form-error" role="alert">{error}</p>}
    </div><footer className="modal-footer"><button type="button" className="button secondary" disabled={saving} onClick={onClose}>Cancel</button><button className="button primary" disabled={saving||!!progress}>{saving?'Saving…':progress?'Reading document…':resource?'Save changes':'Save resource'}<ArrowRight size={15}/></button></footer></form>
  </Modal>;
}
