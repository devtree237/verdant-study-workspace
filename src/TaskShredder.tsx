import { useEffect, useRef } from 'react';
import { Archive, Check } from 'lucide-react';
import './task-shredder.css';

export type TaskArchiveVisual = { key: string; taskId: string; title: string; subjectName?: string; archivedAt: string; columnId: string; layout: 'stage' | 'priority' };
type Texture = { canvas: HTMLCanvasElement; scale: number };
type Strip = { x: number; width: number; curl: number; wave: number; random: number; angle: number; ax: number; ay: number; vy: number; vx: number; free: boolean; alpha: number; points: number[] };
const SLIVER = 2, OVER = 24, DEG = Math.PI / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const ease = (from: number, to: number, dt: number, tau: number) => from + (to - from) * (1 - Math.exp(-dt / tau));

function linesFor(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
 const words = text.trim().split(/\s+/), lines: string[] = []; let line = '';
 for (const word of words) { const next = line ? line + ' ' + word : word; if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next; }
 if (line) lines.push(line);
 if (lines.length > 2) { let last = lines[1]; while (last && ctx.measureText(last + '…').width > width) last = last.slice(0,-1); return [lines[0], last + '…']; }
 return lines;
}
/** Paint the same real task text as the paper face. No DOM screenshots, remote
 * images, network requests, or task data are required by the strip texture. */
function textureFor(face: HTMLDivElement, title: string, subject: string, width: number, height: number): Texture | undefined {
 const canvas = document.createElement('canvas'), scale = Math.min(2, window.devicePixelRatio || 1), ctx = canvas.getContext('2d'); if (!ctx) return;
 canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale); ctx.scale(scale,scale);
 const style = getComputedStyle(face), heading = face.querySelector<HTMLElement>('.board-shredder-title'), detail = face.querySelector<HTMLElement>('.board-shredder-detail');
 ctx.fillStyle = style.backgroundColor; ctx.beginPath(); ctx.roundRect(.5,.5,width-1,height-1,7); ctx.fill(); ctx.strokeStyle = style.borderColor; ctx.stroke();
 ctx.strokeStyle = style.getPropertyValue('--accent').trim() || '#7c5cff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(17,20,6,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(14,20);ctx.lineTo(16,22);ctx.lineTo(20,18);ctx.stroke();
 const titleStyle = heading ? getComputedStyle(heading) : style; ctx.fillStyle = titleStyle.color; ctx.font = `${titleStyle.fontWeight} 12px ${titleStyle.fontFamily}`;
 linesFor(ctx,title,width-47).forEach((line,index)=>ctx.fillText(line,31,23+index*16));
 const detailStyle = detail ? getComputedStyle(detail) : style; ctx.fillStyle=detailStyle.color;ctx.font=`10px ${detailStyle.fontFamily}`;ctx.fillText(subject,31,height-12,width-44);
 return { canvas,scale };
}

// Roller acceleration, sliced texture painting, curl and falling-strip physics
// adapted from the user's React Bits Shredder source. This is a one-shot archive
// presentation: the completion callback only removes an already-saved visual.
export function TaskShredder({item,onComplete}:{item:TaskArchiveVisual;onComplete:(key:string)=>void}) {
 const root = useRef<HTMLDivElement>(null), paper = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), slit = useRef<HTMLDivElement>(null), completed = useRef(onComplete);
 completed.current=onComplete;
 useEffect(()=>{
  const element=root.current,face=paper.current,surface=canvas.current;if(!element||!face||!surface)return;
  let raf=0,alive=true,done=false,last=performance.now(),began=last,age=0,ry=8;
  const finish=()=>{if(done||!alive)return;done=true;cancelAnimationFrame(raf);completed.current(item.key);};
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const visibility=()=>{if(document.hidden)finish();};const motionChange=()=>{if(preference.matches)finish();};
  if(preference.matches||document.hidden){finish();return;}
  const width=face.offsetWidth,height=face.offsetHeight,lip=height+12,fall=82,dpr=Math.min(2,window.devicePixelRatio||1),ctx=surface.getContext('2d');
  if(!width||!height||!ctx){finish();return;}
  element.style.setProperty('--sh-lip',lip+'px');element.style.setProperty('--sh-height',lip+fall+5+'px');
  surface.width=Math.ceil((element.offsetWidth+OVER*2)*dpr);surface.height=Math.ceil(fall*dpr);
  const texture=textureFor(face,item.title,item.subjectName ? item.subjectName+' · Completed' : 'Completed',width,height);
  if(!texture){finish();return;}
  const count=Math.max(1,Math.round(width/10)),stripWidth=Math.floor(width/count),strips:Strip[]=Array.from({length:count},(_,index)=>({x:index*stripWidth,width:index===count-1?width-stripWidth*(count-1):stripWidth,curl:(Math.random()<.5?-1:1)*(.35+Math.random()*.55)*DEG,wave:Math.random()*Math.PI*2,random:Math.random(),angle:0,ax:0,ay:0,vy:0,vx:0,free:false,alpha:1,points:[]}));
  const step=(now:number)=>{
   if(!alive||done)return;const dt=clamp((now-last)/1000,0,.05);last=now;age+=dt;
   if(now-began>2400){finish();return;}
   const speed=180*(1+1.4*Math.exp(-age/.14));ry+=speed*dt;
   face.style.transform=`translateY(${ry}px)`;if(ry>=lip)face.style.visibility='hidden';
   if(slit.current)slit.current.style.transform=ry<lip?`translateX(${Math.sin(age*140)*.45}px)`:'';
   ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,surface.width,surface.height);
   let remaining=0;
   for(const strip of strips){
    let length=height,core=1,tear=0;
    if(!strip.free){
     const top=ry-lip-4,hang=top+height;if(hang<=0){remaining++;continue;}
     strip.ax=8+strip.x+strip.width/2;strip.ay=0;strip.angle=Math.sin(age*6+strip.wave)*.03*smooth(hang/40);
     if(top>=0){strip.free=true;strip.ay=top;strip.vy=speed;strip.vx=(strip.random-.5)*40;}else length=Math.min(height,hang);
    }
    if(strip.free){
     tear=Math.pow(clamp((strip.ay+height/2)/fall,0,1),1.2);strip.vy=ease(strip.vy,150+strip.random*230,dt,.25);strip.vx=ease(strip.vx,(strip.random-.5)*190*tear,dt,.4);strip.ax+=strip.vx*dt;strip.ay+=strip.vy*dt;strip.angle=ease(strip.angle,(strip.random-.5)*.7,dt,.5);core=1-smooth(tear/.85)*(.8-strip.random*.16);strip.alpha=1-smooth((tear-.6)/.4);
    }
    if(strip.alpha<=.01||strip.ay>fall)continue;remaining++;
    const points=strip.points;points.length=0;let x=strip.ax,y=strip.ay;
    for(let index=0;index<=Math.ceil(length/SLIVER);index++){
     const distance=Math.min(index*SLIVER,length),angle=strip.angle+strip.curl*distance+.04*Math.sin(distance*.13+strip.wave),flutter=(3+9*strip.random)*tear*Math.sin(distance*.045+age*(1.6+strip.random*2.2)+strip.wave);
     points.push(x+flutter*Math.cos(angle),y-flutter*Math.sin(angle),angle);const h=Math.min(SLIVER,length-distance);x+=Math.sin(angle)*h;y+=Math.cos(angle)*h;
    }
    const visibleWidth=strip.width*core,sx=(strip.x+(strip.width-visibleWidth)/2)*texture.scale,v0=height-length;ctx.globalAlpha=strip.alpha;
    for(let index=0;index+3<points.length;index+=3){const distance=index/3*SLIVER,h=Math.min(SLIVER,length-distance);if(h<=0)break;const cos=Math.cos(points[index+2]),sin=Math.sin(points[index+2]);ctx.setTransform(dpr*cos,-dpr*sin,dpr*sin,dpr*cos,dpr*(points[index]+OVER),dpr*points[index+1]);ctx.drawImage(texture.canvas,sx,(v0+distance)*texture.scale,visibleWidth*texture.scale,h*texture.scale,-visibleWidth/2,0,visibleWidth,h+.4);}
   }
   ctx.globalAlpha=1;if(remaining)raf=requestAnimationFrame(step);else finish();
  };
  raf=requestAnimationFrame(step);document.addEventListener('visibilitychange',visibility);preference.addEventListener('change',motionChange);window.addEventListener('resize',finish);
  return()=>{alive=false;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);preference.removeEventListener('change',motionChange);window.removeEventListener('resize',finish);surface.width=0;surface.height=0;};
 },[item.key,item.title,item.subjectName]);
 return <div ref={root} className="board-shredder" aria-hidden="true"><div className="board-shredder-caption"><Archive size={12}/>Saved in History</div><div className="board-shredder-feed"><div ref={paper} className="board-shredder-paper"><Check size={14}/><div><b className="board-shredder-title">{item.title}</b><span className="board-shredder-detail">{item.subjectName ? item.subjectName+' · Completed' : 'Completed'}</span></div></div></div><div ref={slit} className="board-shredder-slit"/><canvas ref={canvas} className="board-shredder-canvas"/></div>;
}
