import { SmoothSelect } from './components/ui/SmoothSelect';
import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, Mic, Square, X } from 'lucide-react';
import './speech.css';

export const GOOGLE_SPEECH_CLIENT_ID = '616290169874-atfo96hg3ebbsglsmemj20cg3qij2rpu.apps.googleusercontent.com';
const CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
type Status = 'idle' | 'starting' | 'listening' | 'processing' | 'authorizing';
type RecognitionResult = { isFinal: boolean; [index: number]: { transcript: string } | undefined };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type BrowserRecognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null; onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type TokenResponse = { access_token?: string; expires_in?: number; scope?: string; error?: string };
type GoogleOAuth = { initTokenClient(config: { client_id: string; scope: string; include_granted_scopes: boolean; callback: (response: TokenResponse) => void; error_callback: (error: { type: string }) => void }): { requestAccessToken(config?: { prompt?: string }): void } };
const speechWindow = () => window as unknown as { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition; google?: { accounts?: { oauth2?: GoogleOAuth } }; webkitAudioContext?: typeof AudioContext };

export function appendTranscript(current: string, fragment: string): string {
  const spoken = fragment.trim().replace(/\s+/g, ' ');
  if (!spoken) return current;
  return current + (!current || /\s$/.test(current) || /^[,.;:!?।]/u.test(spoken) ? '' : ' ') + spoken;
}
/** Final result indices are immutable within one browser recognition session. */
export function collectSpeechResults(results: ArrayLike<RecognitionResult>, committed: Set<number>): { finalText: string; interimText: string } {
  const final: string[] = [], interim: string[] = [];
  for (let index = 0; index < results.length; index++) {
    const result = results[index], value = result[0]?.transcript?.trim() || '';
    if (result.isFinal) { if (!committed.has(index)) { committed.add(index); if (value) final.push(value); } }
    else if (value) interim.push(value);
  }
  return { finalText: final.join(' '), interimText: interim.join(' ') };
}
export function googleTranscript(value: unknown): string {
  if (!value || typeof value !== 'object') throw new Error('Google returned an invalid speech response.');
  const results = (value as { results?: unknown }).results;
  if (results === undefined) return '';
  if (!Array.isArray(results)) throw new Error('Google returned an invalid speech response.');
  return results.map(result => {
    const text = result?.alternatives?.[0]?.transcript;
    if (typeof text !== 'string') throw new Error('Google returned an invalid transcript.');
    return text.trim();
  }).filter(Boolean).join(' ');
}
export function encodeMonoWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new Error('The recording sample rate is unsupported.');
  if (!samples.length || samples.length > sampleRate * 60) throw new Error('Record between a moment and 60 seconds of speech.');
  const output = new ArrayBuffer(44 + samples.length * 2), view = new DataView(output);
  const string = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  string(0, 'RIFF'); view.setUint32(4, output.byteLength - 8, true); string(8, 'WAVE'); string(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); string(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) { const sample = Number.isFinite(samples[index]) ? Math.max(-1, Math.min(1, samples[index])) : 0; view.setInt16(44 + index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); }
  return output;
}
function base64(buffer: ArrayBuffer): string { const bytes = new Uint8Array(buffer); let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192)); return btoa(binary); }

let identityPromise: Promise<GoogleOAuth> | null = null;
function loadGoogleIdentity(): Promise<GoogleOAuth> {
  const available = speechWindow().google?.accounts?.oauth2;
  if (available) return Promise.resolve(available);
  if (identityPromise) return identityPromise;
  identityPromise = new Promise<GoogleOAuth>((resolve, reject) => {
    const id = 'verdant-google-identity', existing = document.getElementById(id) as HTMLScriptElement | null;
    const script = existing || document.createElement('script');
    const done = () => { const oauth = speechWindow().google?.accounts?.oauth2; if (oauth) finish(() => resolve(oauth)); else failed(); };
    const failed = () => finish(() => { if (!existing) script.remove(); reject(new Error('Google sign-in could not load. Check your connection and try again.')); });
    const timeout = window.setTimeout(failed, 20000);
    const finish = (callback: () => void) => { window.clearTimeout(timeout); script.removeEventListener('load', done); script.removeEventListener('error', failed); callback(); };
    script.addEventListener('load', done); script.addEventListener('error', failed);
    if (!existing) { script.id = id; script.src = 'https://accounts.google.com/gsi/client'; script.async = true; document.head.appendChild(script); }
  }).catch(error => { identityPromise = null; throw error; });
  return identityPromise;
}
const recognitionMessage = (code: string) => ({ 'not-allowed': 'Microphone access was denied. Allow the microphone in your browser’s site settings, then try again.', 'service-not-allowed': 'This browser’s speech service is unavailable. Try Chrome or the Google Cloud option.', 'audio-capture': 'No microphone is available. Connect one and try again.', 'no-speech': 'No speech was heard. Try again and speak clearly.', network: 'The browser speech service could not connect. Check your connection and try again.', 'language-not-supported': 'This speech service does not support the selected language. Try the other language or Google Cloud.' }[code] || 'Dictation stopped. Try again or type your task.');

export function TaskDictation({ onTranscript, onBusyChange, label = 'Dictate task', targetLabel = 'task title' }: { onTranscript: (text: string) => void; onBusyChange?: (busy: boolean) => void; label?: string; targetLabel?: string }) {
  const id = useId(), [provider, setProvider] = useState<'browser' | 'google'>('browser'), [language, setLanguage] = useState('en-IN');
  const [status, setStatus] = useState<Status>('idle'), [interim, setInterim] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [project, setProject] = useState(''), [oauth, setOAuth] = useState<GoogleOAuth | null>(null), [identityLoading, setIdentityLoading] = useState(false), [connected, setConnected] = useState(false), [identityRetry, setIdentityRetry] = useState(0);
  const callback = useRef(onTranscript), busyCallback = useRef(onBusyChange); callback.current = onTranscript; busyCallback.current = onBusyChange;
  const mounted = useRef(true), generation = useRef(0), recognition = useRef<BrowserRecognition | null>(null), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), timeout = useRef<number | null>(null), request = useRef<AbortController | null>(null), audioContext = useRef<AudioContext | null>(null), token = useRef<{ value: string; expiresAt: number } | null>(null);
  const browserSupported = typeof window !== 'undefined' && !!(speechWindow().SpeechRecognition || speechWindow().webkitSpeechRecognition);
  const recordingSupported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  const busy = status !== 'idle';
  const transition = (value: Status) => { if (mounted.current) { setStatus(value); busyCallback.current?.(value !== 'idle'); } };
  function releaseMicrophone() { if (timeout.current !== null) window.clearTimeout(timeout.current); timeout.current = null; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; }
  function cancel() {
    generation.current++; const active = recognition.current; recognition.current = null;
    if (active) { active.onstart = active.onresult = active.onerror = active.onend = null; try { active.abort(); } catch { /* Already stopped. */ } }
    const current = recorder.current; recorder.current = null; if (current) { current.onstop = current.ondataavailable = current.onerror = null; if (current.state !== 'inactive') try { current.stop(); } catch { /* Already stopped. */ } }
    releaseMicrophone(); request.current?.abort(); request.current = null; void audioContext.current?.close().catch(() => {}); audioContext.current = null;
    if (mounted.current) { setInterim(''); transition('idle'); }
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancel(); token.current = null; busyCallback.current?.(false); }; }, []);
  useEffect(() => {
    if (provider !== 'google') return;
    let active = true; setIdentityLoading(true); setError('');
    void loadGoogleIdentity().then(value => { if (active) setOAuth(value); }, failure => { if (active) setError(failure.message); }).finally(() => { if (active) setIdentityLoading(false); });
    return () => { active = false; };
  }, [provider, identityRetry]);

  function authorize() {
    if (!oauth) return;
    const current = ++generation.current; setError(''); setMessage(''); transition('authorizing');
    try {
      oauth.initTokenClient({ client_id: GOOGLE_SPEECH_CLIENT_ID, scope: CLOUD_SCOPE, include_granted_scopes: false,
        callback: response => { if (!mounted.current || generation.current !== current) return; transition('idle'); if (!response.access_token || response.error || !response.scope?.split(/\s+/).includes(CLOUD_SCOPE)) { setError('Google access was not granted. Check the OAuth consent screen, test users, and Cloud Speech permissions.'); return; } token.current = { value: response.access_token, expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000 }; setConnected(true); setMessage('Google connected for this open form. Choose a project and start dictation.'); },
        error_callback: failure => { if (!mounted.current || generation.current !== current) return; transition('idle'); setError(failure.type === 'popup_closed' ? 'Google sign-in was closed. You can connect again.' : 'Google sign-in could not open. Allow popups and add this site to the OAuth client’s authorized origins.'); },
      }).requestAccessToken({ prompt: 'select_account' });
    } catch { transition('idle'); setError('Google sign-in could not start. Check this site’s authorized origin in Google Cloud.'); }
  }
  function startBrowser() {
    const Constructor = speechWindow().SpeechRecognition || speechWindow().webkitSpeechRecognition;
    if (!Constructor) { setError('This browser does not provide speech recognition. Try Chrome or configure Google Cloud.'); return; }
    const current = ++generation.current, engine = new Constructor(), committed = new Set<number>(); recognition.current = engine;
    setError(''); setMessage(''); setInterim(''); transition('starting'); engine.lang = language; engine.continuous = true; engine.interimResults = true;
    engine.onstart = () => { if (mounted.current && generation.current === current) transition('listening'); };
    engine.onresult = event => { if (!mounted.current || generation.current !== current) return; const result = collectSpeechResults(event.results, committed); setInterim(result.interimText); if (result.finalText) { callback.current(result.finalText); setMessage(`Recognized words added to your ${targetLabel}.`); } };
    engine.onerror = event => { if (!mounted.current || generation.current !== current) return; if (event.error !== 'aborted') setError(recognitionMessage(event.error)); setInterim(''); transition('idle'); };
    engine.onend = () => { if (!mounted.current || generation.current !== current) return; recognition.current = null; setInterim(''); transition('idle'); };
    try { engine.start(); } catch { recognition.current = null; transition('idle'); setError('Dictation could not start. Check microphone permission and try again.'); }
  }
  async function transcribe(audio: Blob, current: number, accessToken: string, quotaProject: string, lang: string) {
    let context: AudioContext | null = null;
    try {
      const Constructor = window.AudioContext || speechWindow().webkitAudioContext;
      if (!Constructor) throw new Error('This browser cannot decode microphone recordings. Try Chrome.');
      context = new Constructor({ sampleRate: 16000 }); audioContext.current = context;
      const decoded = await context.decodeAudioData(await audio.arrayBuffer());
      if (!mounted.current || generation.current !== current) return;
      if (decoded.duration > 59) throw new Error('This recording is too long. Try a shorter phrase under 55 seconds.');
      const mono = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) { const data = decoded.getChannelData(channel); for (let index = 0; index < mono.length; index++) mono[index] += data[index] / decoded.numberOfChannels; }
      const wav = encodeMonoWav(mono, decoded.sampleRate), controller = new AbortController(); request.current = controller;
      const response = await fetch('https://speech.googleapis.com/v1/speech:recognize', { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'x-goog-user-project': quotaProject }, body: JSON.stringify({ config: { encoding: 'LINEAR16', sampleRateHertz: decoded.sampleRate, languageCode: lang, enableAutomaticPunctuation: true }, audio: { content: base64(wav) } }) });
      const value = await response.json(); if (!mounted.current || generation.current !== current) return;
      if (!response.ok) { if (response.status === 401) { token.current = null; setConnected(false); } const detail = typeof value?.error?.message === 'string' ? value.error.message.slice(0, 350) : ''; throw new Error(response.status === 401 ? 'Google access expired. Reconnect Google and try again.' : response.status === 403 ? `Google denied this request. Enable Speech-to-Text, billing, and project permissions. ${detail}` : response.status === 429 ? 'Google’s speech quota is unavailable. Try later or use browser dictation.' : `Google could not transcribe this recording. ${detail}`); }
      const text = googleTranscript(value); if (text) { callback.current(text); setMessage(`Google transcript added to your ${targetLabel}.`); } else setMessage('No speech was recognized. Try again with a clearer phrase.');
    } catch (failure) { if (mounted.current && generation.current === current) setError(failure instanceof Error && failure.name !== 'TypeError' ? failure.message : 'Google could not be reached. Check your network and Cloud project setup.'); }
    finally { if (context) void context.close().catch(() => {}); if (audioContext.current === context) audioContext.current = null; if (mounted.current && generation.current === current) { request.current = null; transition('idle'); } }
  }
  function stopCloud() { const current = recorder.current; if (!current || current.state === 'inactive') return; transition('processing'); current.stop(); releaseMicrophone(); }
  async function startCloud() {
    if (!/^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|\d{6,20})$/.test(project.trim())) { setError('Enter your Google Cloud project ID or project number.'); return; }
    const access = token.current;
    if (!access || access.expiresAt <= Date.now() + 70000) { token.current = null; setConnected(false); setError('Connect Google to authorize speech recognition before recording.'); return; }
    if (!recordingSupported) { setError('This browser cannot record microphone audio. Use Chrome or browser dictation.'); return; }
    const current = ++generation.current, quotaProject = project.trim(), lang = language;
    setError(''); setMessage(''); setInterim(''); transition('starting');
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true } });
      if (!mounted.current || generation.current !== current) { microphone.getTracks().forEach(track => track.stop()); return; }
      stream.current = microphone;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(value => MediaRecorder.isTypeSupported(value));
      const recording = mime ? new MediaRecorder(microphone, { mimeType: mime }) : new MediaRecorder(microphone), parts: Blob[] = []; recorder.current = recording;
      recording.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
      recording.onerror = () => { if (mounted.current && generation.current === current) { cancel(); setError('Microphone recording failed. Check your device and try again.'); } };
      recording.onstop = () => { recorder.current = null; releaseMicrophone(); if (!mounted.current || generation.current !== current) return; transition('processing'); void transcribe(new Blob(parts, { type: recording.mimeType }), current, access.value, quotaProject, lang); };
      recording.start(); transition('listening'); timeout.current = window.setTimeout(stopCloud, 55000);
    } catch (failure) { releaseMicrophone(); if (mounted.current && generation.current === current) { transition('idle'); setError(failure instanceof DOMException && failure.name === 'NotAllowedError' ? recognitionMessage('not-allowed') : failure instanceof DOMException && failure.name === 'NotFoundError' ? recognitionMessage('audio-capture') : 'The microphone could not start. Check your browser and device permissions.'); } }
  }
  function start() { if (!window.isSecureContext) { setError('Microphone dictation requires HTTPS or localhost.'); return; } if (provider === 'browser') startBrowser(); else void startCloud(); }
  function stop() { if (provider === 'google') stopCloud(); else { transition('processing'); try { recognition.current?.stop(); } catch { cancel(); } } }

  return <section className="task-dictation" aria-label="Voice to text">
    <div className="dictation-controls"><button type="button" className={`button secondary small ${status === 'listening' ? 'dictation-listening' : ''}`} onClick={status === 'listening' ? stop : start} disabled={status !== 'idle' && status !== 'listening' || provider === 'browser' && !browserSupported} aria-pressed={status === 'listening'} aria-describedby={`${id}-hint`}>{status === 'listening' ? <Square size={14} /> : busy ? <LoaderCircle size={14} className="dictation-spinner" /> : <Mic size={14} />}{status === 'listening' ? 'Stop dictation' : status === 'starting' ? 'Opening microphone…' : status === 'processing' ? 'Transcribing…' : status === 'authorizing' ? 'Connecting…' : label}</button><SmoothSelect aria-label="Dictation language" value={language} disabled={busy} onChange={event => setLanguage(event.target.value)}><option value="en-IN">English · India</option><option value="hi-IN">हिन्दी · Hindi</option></SmoothSelect><SmoothSelect aria-label="Speech recognition provider" value={provider} disabled={busy} onChange={event => { setProvider(event.target.value as 'browser' | 'google'); setError(''); setMessage(''); }}><option value="browser">Browser speech</option><option value="google">Google Cloud Speech</option></SmoothSelect>{busy && status !== 'listening' && <button type="button" className="icon-btn" aria-label="Cancel dictation" onClick={cancel}><X size={14} /></button>}</div>
    <p id={`${id}-hint`} className="dictation-hint">{status === 'listening' ? provider === 'google' ? 'Listening. Stop to transcribe; recordings end after 55 seconds.' : 'Listening. Final words are added automatically; stop to finish dictation.' : provider === 'browser' ? browserSupported ? `Speak to add to your ${targetLabel}. Your browser’s speech service processes the audio.` : 'Browser speech recognition is unavailable here. Try Chrome or configure Google Cloud.' : 'Google receives the recording after you stop. Cloud usage may be billed to your project.'}</p>
    {interim && <p className="dictation-interim" aria-live="polite"><span>Hearing:</span> {interim}</p>}
    {message && <p className="dictation-message" role="status">{message}</p>}{error && <p className="dictation-error" role="alert">{error}</p>}
    {provider === 'google' && <div className="dictation-google"><label>Google Cloud project ID<input value={project} disabled={busy} onChange={event => setProject(event.target.value)} placeholder="Your billing / quota project" autoComplete="off" spellCheck={false} /></label><div><button type="button" className="button secondary small" disabled={busy || !oauth || identityLoading} onClick={authorize}>{identityLoading ? 'Loading Google…' : connected ? 'Reconnect Google' : 'Connect Google'}</button>{!identityLoading && !oauth && <button type="button" className="text-link" onClick={() => setIdentityRetry(value => value + 1)}>Retry sign-in loader</button>}</div><details><summary>Google Cloud setup</summary><p>A public OAuth client ID identifies the app. It does not enable Speech-to-Text or pay for requests. Enable the Speech-to-Text API and billing for your project, grant your Google account Speech access and Service Usage Consumer, and configure the consent screen / test users.</p><p>Add <code>{window.location.origin}</code> to this web OAuth client’s authorized JavaScript origins. No client secret or API key belongs in this form. The access token stays only in memory until this form closes.</p><a href="https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid" target="_blank" rel="noreferrer">OAuth origin setup</a><a href="https://docs.cloud.google.com/speech-to-text/docs/v1/authentication" target="_blank" rel="noreferrer">Speech authentication setup</a></details></div>}
  </section>;
}
