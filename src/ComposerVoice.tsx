import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, Mic } from 'lucide-react';
import { useApiConfig } from './ApiConfigContext';
import { transcribeAudio } from './api-services';
import { collectSpeechResults, speechWindow, recognitionMessage, type BrowserRecognition } from './speech';
import './composer-voice.css';

type Phase = 'idle' | 'opening' | 'recording' | 'processing';
type Props = { disabled: boolean; onTranscript: (text: string) => void; onBusyChange: (busy: boolean) => void };

export function ComposerVoice({ disabled, onTranscript, onBusyChange }: Props) {
  const { configs, statuses, voiceOptions } = useApiConfig();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [interim, setInterim] = useState('');
  const [typing, setTyping] = useState(false);
  const statusId = useId();
  const bars = useRef<HTMLSpanElement>(null);
  const active = useRef<AbortController | null>(null);
  const capture = useRef<MediaStream | null>(null);
  const recognition = useRef<BrowserRecognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const context = useRef<AudioContext | null>(null);
  const frame = useRef(0), limit = useRef(0), typingTimer = useRef(0);
  const queue = useRef<string[]>([]);
  const callbacks = useRef({ onTranscript, onBusyChange });
  callbacks.current = { onTranscript, onBusyChange };

  function releaseCapture() {
    window.clearTimeout(limit.current);
    cancelAnimationFrame(frame.current);
    capture.current?.getTracks().forEach(track => track.stop());
    capture.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
  }

  function cancel() {
    active.current?.abort();
    active.current = null;
    try { recognition.current?.abort(); } catch { /* The engine can already be stopped. */ }
    recognition.current = null;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recorder.current = null;
    releaseCapture();
  }

  useEffect(() => () => {
    cancel();
    window.clearTimeout(typingTimer.current);
    queue.current = [];
    typingTimer.current = 0;
    callbacks.current.onBusyChange(false);
  }, []);

  useEffect(() => { callbacks.current.onBusyChange(phase !== 'idle' || typing); }, [phase, typing]);

  function insert(text: string) {
    const words = text.trim().split(/\s+/u).filter(Boolean);
    if (!words.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      callbacks.current.onTranscript(words.join(' '));
      return;
    }
    const groupSize = Math.max(1, Math.ceil(words.length / 24));
    for (let index = 0; index < words.length; index += groupSize) queue.current.push(words.slice(index, index + groupSize).join(' '));
    if (typingTimer.current) return;
    setTyping(true);
    const tick = () => {
      const next = queue.current.shift();
      if (next) callbacks.current.onTranscript(next);
      typingTimer.current = queue.current.length ? window.setTimeout(tick, 20) : 0;
      if (!typingTimer.current) setTyping(false);
    };
    typingTimer.current = window.setTimeout(tick, 20);
  }

  function meter(stream: MediaStream) {
    const Audio = window.AudioContext || speechWindow().webkitAudioContext;
    if (!Audio) return;
    try {
      const audio = new Audio();
      context.current = audio;
      const analyser = audio.createAnalyser();
      analyser.fftSize = 256;
      audio.createMediaStreamSource(stream).connect(analyser);
      const frequencies = new Uint8Array(analyser.frequencyBinCount);
      void audio.resume().catch(() => {});
      const draw = () => {
        analyser.getByteFrequencyData(frequencies);
        Array.from(bars.current?.children || []).forEach((bar, index) => {
          const level = frequencies[2 + index * 3] / 255;
          (bar as HTMLElement).style.setProperty('--voice-level', String(.25 + level * .75));
        });
        frame.current = requestAnimationFrame(draw);
      };
      frame.current = requestAnimationFrame(draw);
    } catch { /* Dictation still works when audio analysis is unavailable. */ }
  }

  function finish(controller: AbortController, message = '') {
    if (active.current !== controller || controller.signal.aborted) return;
    cancel();
    setPhase('idle');
    setInterim('');
    if (message) setError(message);
  }

  function stop() {
    const controller = active.current;
    if (!controller) return;
    window.clearTimeout(limit.current);
    setPhase('processing');
    try {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      else if (recognition.current) {
        limit.current = window.setTimeout(() => finish(controller), 5000);
        recognition.current.stop();
      }
      else finish(controller);
    } catch { finish(controller, 'The recording could not finish. Try again.'); }
  }

  async function start() {
    if (active.current) return;
    setError('');
    const endpointMode = voiceOptions.mode === 'endpoint';
    const Recognition = speechWindow().SpeechRecognition || speechWindow().webkitSpeechRecognition;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError('This browser does not have microphone access here.'); return; }
    if (endpointMode && statuses.voice.state !== 'connected') { setError('Initialize your transcription connection in Profile & API settings.'); return; }
    if (endpointMode ? typeof MediaRecorder === 'undefined' : !Recognition) { setError('This browser does not support the selected voice service. Choose another service in Profile & API settings.'); return; }

    const controller = new AbortController();
    active.current = controller;
    setPhase('opening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
      if (controller.signal.aborted) { stream.getTracks().forEach(track => track.stop()); return; }
      capture.current = stream;
      meter(stream);
      if (endpointMode) {
        const recording = new MediaRecorder(stream), chunks: Blob[] = [];
        recorder.current = recording;
        recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recording.onerror = () => finish(controller, 'Microphone recording failed. Try again.');
        recording.onstop = async () => {
          if (controller.signal.aborted) return;
          recorder.current = null;
          releaseCapture();
          setPhase('processing');
          limit.current = window.setTimeout(() => finish(controller, 'Transcription timed out. Try a shorter recording.'), 30000);
          try {
            const audio = new Blob(chunks, { type: recording.mimeType });
            if (!audio.size) { finish(controller, 'No audio was recorded.'); return; }
            const transcript = await transcribeAudio(configs.voice, audio, voiceOptions.language, controller.signal);
            if (controller.signal.aborted) return;
            insert(transcript);
            finish(controller, transcript.trim() ? '' : 'No speech was recognized.');
          } catch (cause) { finish(controller, cause instanceof Error ? cause.message : 'Transcription failed.'); }
        };
        recording.start();
        setPhase('recording');
      } else if (Recognition) {
        const engine = new Recognition(), committed = new Set<number>();
        recognition.current = engine;
        engine.lang = voiceOptions.language;
        engine.continuous = true;
        engine.interimResults = true;
        engine.onstart = () => { if (!controller.signal.aborted) setPhase('recording'); };
        engine.onresult = event => {
          if (controller.signal.aborted) return;
          const result = collectSpeechResults(event.results, committed);
          setInterim(result.interimText);
          insert(result.finalText);
        };
        engine.onerror = event => finish(controller, event.error === 'aborted' ? '' : recognitionMessage(event.error));
        engine.onend = () => finish(controller);
        engine.start();
      }
      limit.current = window.setTimeout(stop, 55000);
    } catch (cause) {
      const message = cause instanceof DOMException && cause.name === 'NotAllowedError' ? recognitionMessage('not-allowed') : 'The microphone could not start. Check your device and browser permissions.';
      finish(controller, message);
    }
  }

  const recording = phase === 'recording';
  const label = recording ? 'Stop recording' : phase === 'opening' ? 'Cancel microphone access' : phase === 'processing' ? 'Cancel transcription' : 'Start voice recording';
  const message = error || interim || (recording ? 'Listening…' : phase === 'opening' ? 'Opening microphone…' : phase === 'processing' ? 'Transcribing…' : '');
  return <span className="composer-voice">
    {message && <span className={`composer-voice-status ${error ? 'is-error' : ''}`} id={statusId} role={error ? 'alert' : 'status'}>{message}</span>}
    <button type="button" className={`chat-microphone composer-mic ${recording ? 'is-recording' : ''}`} aria-label={label} title={label} aria-pressed={recording} aria-describedby={message ? statusId : undefined} disabled={disabled} onClick={() => {
      if (recording) stop();
      else if (phase === 'idle') void start();
      else { cancel(); setPhase('idle'); setInterim(''); }
    }}>
      {recording ? <span className="composer-mic-wave" ref={bars} aria-hidden="true">{[0,1,2,3,4,5,6].map(bar => <i key={bar} />)}</span> : phase !== 'idle' ? <LoaderCircle size={17} className="dictation-spinner" /> : <Mic size={17} />}
    </button>
  </span>;
}
