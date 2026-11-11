import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Maximize, Minimize, Pause, Play, RotateCcw } from 'lucide-react';
import { day } from './model';
import { useStore } from './store';
import { TimerDigits } from './ui';
import './focus-page.css';

const sessionLengths = [25, 45, 60];

export function useFocusTimer() {
  const { update, notify } = useStore();
  const [seconds, setSeconds] = useState(() => {
    try { return Number(localStorage.getItem('verdant.timer.remaining')) || 1500; }
    catch { return 1500; }
  });
  const [end, setEnd] = useState<number | null>(() => {
    try { return Number(localStorage.getItem('verdant.timer.end')) || null; }
    catch { return null; }
  });
  const [mode, setMode] = useState(() => {
    try { return Number(localStorage.getItem('verdant.timer.mode')) || 25; }
    catch { return 25; }
  });
  const [completed, setCompleted] = useState(false);
  const recordedEnd = useRef<number | null>(null);
  const callbacks = useRef({ update, notify });
  callbacks.current = { update, notify };

  useEffect(() => {
    try {
      localStorage.setItem('verdant.timer.remaining', String(seconds));
      localStorage.setItem('verdant.timer.mode', String(mode));
      if (end) localStorage.setItem('verdant.timer.end', String(end));
      else localStorage.removeItem('verdant.timer.end');
    } catch { /* Timer can operate in memory. */ }
  }, [seconds, end, mode]);

  useEffect(() => {
    const deadline = end;
    if (!deadline) return;
    const tick = () => {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      if (remaining > 0) {
        setSeconds(remaining);
        return;
      }
      clearInterval(interval);
      if (recordedEnd.current === deadline) return;
      recordedEnd.current = deadline;
      setEnd(null);
      setCompleted(true);
      setSeconds(mode * 60);
      callbacks.current.update(state => ({
        ...state,
        focusMinutes: state.focusMinutes + mode,
        focusLog: [...state.focusLog, { date: day(), minutes: mode }],
      }));
      callbacks.current.notify('Focus session complete. Take a breath.');
    };
    const interval = setInterval(tick, 500);
    tick();
    return () => clearInterval(interval);
  }, [end, mode]);

  function reset(minutes = mode) {
    setEnd(null);
    setCompleted(false);
    setSeconds(minutes * 60);
  }

  return {
    seconds, mode, completed, running: end !== null,
    start: () => { setCompleted(false); setEnd(Date.now() + seconds * 1000); },
    pause: () => {
      if (!end) return;
      const remaining = Math.ceil((end - Date.now()) / 1000);
      if (remaining > 0) {
        setSeconds(remaining);
        setEnd(null);
      }
    },
    reset: () => reset(),
    setMode: (minutes: number) => { setMode(minutes); reset(minutes); },
  };
}

type Timer = ReturnType<typeof useFocusTimer>;

function FocusDial() {
  return <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
    <circle cx="24" cy="26" r="17" fill="var(--accent-soft)"/>
    <circle cx="24" cy="26" r="15.5" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".35"/>
    <path d="M24 10.5a15.5 15.5 0 0 1 15.5 15.5M24 26l6-6M20 4.5h8M24 4.5v6M35.5 14.5l3-3"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="24" cy="26" r="2" fill="currentColor"/>
  </svg>;
}

function FocusControls({ timer, immersive, onToggle, onScreen }: {
  timer: Timer; immersive: boolean; onToggle: () => void; onScreen: () => void;
}) {
  const remaining = timer.completed ? 0 : timer.seconds;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const time = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const screenLabel = immersive ? 'Exit fullscreen' : 'Enter fullscreen';
  const state = timer.completed ? 'Session complete' : timer.running ? 'Focusing' : timer.seconds < timer.mode * 60 ? 'Paused' : 'Pomodoro';

  return <>
    <header className="pomodoro-header">
      <div className="pomodoro-heading">
        <FocusDial/>
        <h1>Focus</h1>
      </div>
      {(immersive || timer.running) && <button className="pomodoro-icon" type="button" aria-label={screenLabel} title={screenLabel} onClick={onScreen}>
        {immersive ? <Minimize size={18}/> : <Maximize size={18}/>}
      </button>}
    </header>
    <div className="pomodoro-content">
      <p className="pomodoro-status" role="status">{state}</p>
      <div className="focus-clock" role="timer" aria-label={`${minutes} minutes ${seconds} seconds remaining`}>
        <TimerDigits value={time}/>
      </div>
      <progress className="pomodoro-progress" max={timer.mode * 60} value={timer.mode * 60 - remaining} aria-label="Session progress"/>
      {!immersive && <div className="pomodoro-lengths" role="group" aria-label="Session length">
        {sessionLengths.map(minutes => <button type="button" key={minutes} aria-pressed={minutes === timer.mode}
          disabled={timer.running} onClick={() => timer.setMode(minutes)}>{minutes} min</button>)}
      </div>}
      <div className="pomodoro-actions">
        <button className="button primary pomodoro-start" type="button" onClick={onToggle}>
          {timer.running ? <Pause size={17}/> : <Play size={17}/>}
          {timer.running ? 'Pause' : state === 'Paused' ? 'Resume' : 'Start focus'}
        </button>
        <button className="pomodoro-icon pomodoro-reset" type="button" aria-label="Reset focus timer" title="Reset focus timer" onClick={timer.reset}>
          <RotateCcw size={17}/>
        </button>
      </div>
    </div>
  </>;
}

export function FocusPage({ timer }: { timer: Timer }) {
  const stage = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const requesting = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [immersiveFallback, setImmersiveFallback] = useState(false);

  useEffect(() => {
    const element = stage.current;
    const sync = () => setFullscreen(document.fullscreenElement === element);
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      if (element && document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useLayoutEffect(() => {
    if (immersiveFallback && !dialog.current?.open) dialog.current?.showModal();
  }, [immersiveFallback]);

  async function enterFocusScreen() {
    const element = stage.current;
    if (!element || requesting.current || document.fullscreenElement === element || immersiveFallback) return;
    requesting.current = true;
    try {
      if (typeof element.requestFullscreen === 'function' && document.fullscreenEnabled && !document.fullscreenElement) {
        await element.requestFullscreen({ navigationUI: 'hide' });
        if (document.fullscreenElement === element) return;
      }
    } catch { /* Embedded or unsupported browsers can use the in-app view. */ }
    finally { requesting.current = false; }
    if (element.isConnected && typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function') {
      setImmersiveFallback(true);
    }
  }

  function toggle() {
    if (timer.running) timer.pause();
    else {
      timer.start();
      void enterFocusScreen();
    }
  }

  return <div className="pomodoro-page">
    <section ref={stage} className="pomodoro-view" aria-label="Focus timer">
      <FocusControls timer={timer} immersive={fullscreen} onToggle={toggle}
        onScreen={fullscreen ? () => { void document.exitFullscreen().catch(() => {}); } : () => { void enterFocusScreen(); }}/>
    </section>
    {immersiveFallback && <dialog className="pomodoro-dialog" ref={dialog} aria-label="Fullscreen focus timer" onClose={() => setImmersiveFallback(false)}>
      <section className="pomodoro-view">
        <FocusControls timer={timer} immersive onToggle={toggle} onScreen={() => dialog.current?.close()}/>
      </section>
    </dialog>}
  </div>;
}
