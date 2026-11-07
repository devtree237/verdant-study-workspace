import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Cloud, Download, Eye, EyeOff, KeyRound, LoaderCircle, Mic, PlugZap, RefreshCw, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { SmoothSelect } from './components/ui/SmoothSelect';
import { useApiConfig } from './ApiConfigContext';
import { defaultChatSettings } from './chat-api';
import type { ChatSettingsData } from './chat-api';
import { backupWorkspace, fetchCalendarEvents, fetchWorkspaceBackup, mergeCalendarEvents } from './api-services';
import type { ApiService, BridgeService } from './api-services';
import type { State } from './model';
import { rollUpMastery } from './model';
import { archiveCompletedTasks } from './task-history';
import { useStore } from './store';
import './api-settings.css';

const serviceInfo = {
  llm: { title: 'Study assistant', description: 'Your AI provider and model.', Icon: Sparkles },
  voice: { title: 'Voice & transcription', description: 'Speak directly into the chat composer.', Icon: Mic },
  calendar: { title: 'Calendar connection', description: 'Import your calendar events into your study schedule.', Icon: RefreshCw },
  storage: { title: 'Workspace backup', description: 'Keep a copy of your study records on your own service.', Icon: Cloud },
};

function SecretInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="api-field">{label}<span className="api-secret-input"><input type={visible ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} autoComplete="off" spellCheck={false} maxLength={4096} placeholder="Paste your key" /><button type="button" aria-label={visible ? `Hide ${label}` : `Show ${label}`} aria-pressed={visible} onClick={() => setVisible(current => !current)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>;
}

export function ApiSettingsPanel({ services = ['llm', 'voice', 'calendar', 'storage'], onChatSaved }: { services?: ApiService[]; onChatSaved?: (settings: ChatSettingsData) => void }) {
  const api = useApiConfig();
  const { data, update, notify } = useStore();
  const [expanded, setExpanded] = useState<ApiService | null>(services.length === 1 ? services[0] : null);
  const [operation, setOperation] = useState(''), [operationMessage, setOperationMessage] = useState(''), [operationError, setOperationError] = useState('');
  const [restore, setRestore] = useState<State | null>(null);
  const activeRequest = useRef<AbortController | null>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; activeRequest.current?.abort(); }; }, []);
  useEffect(() => { activeRequest.current?.abort(); setRestore(null); setOperation(''); }, [api.configs.calendar.endpoint, api.configs.calendar.apiKey, api.configs.storage.endpoint, api.configs.storage.apiKey]);

  async function runAction(action: 'calendar-import' | 'backup' | 'download') {
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    setOperation(action); setOperationError(''); setOperationMessage('');
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      if (action === 'calendar-import') {
        const events = await fetchCalendarEvents(api.configs.calendar, controller.signal);
        if (!mounted.current || activeRequest.current !== controller || controller.signal.aborted) return;
        update(current => mergeCalendarEvents(current, events, api.configs.calendar.endpoint));
        setOperationMessage(`${events.length} calendar event${events.length === 1 ? '' : 's'} imported. Your Calendar and task views are in sync.`);
      } else if (action === 'backup') {
        await backupWorkspace(api.configs.storage, data, controller.signal);
        if (!mounted.current || activeRequest.current !== controller || controller.signal.aborted) return;
        setOperationMessage('Your study records were backed up. Uploaded files remain on this device.');
      } else {
        const snapshot = await fetchWorkspaceBackup(api.configs.storage, controller.signal);
        if (!mounted.current || activeRequest.current !== controller || controller.signal.aborted) return;
        setRestore(snapshot);
        setOperationMessage('Backup downloaded and checked. Review it before restoring.');
      }
    } catch (cause) {
      if (mounted.current && activeRequest.current === controller) setOperationError(controller.signal.aborted ? 'The request was cancelled or timed out. Your workspace was not changed.' : cause instanceof Error ? cause.message : 'The request could not be completed.');
    } finally { clearTimeout(timeout); if (mounted.current && activeRequest.current === controller) { setOperation(''); activeRequest.current = null; } }
  }

  async function initialize(service: ApiService) {
    const success = await api.initialize(service);
    if (success && service === 'llm') onChatSaved?.({ ...api.chat, rememberKey: false });
  }

  function restoreBackup() {
    if (!restore) return;
    const previous = data;
    const applied = archiveCompletedTasks({ ...restore, folders: rollUpMastery(restore.folders, restore.resources) });
    const signature = JSON.stringify(applied);
    update(() => applied);
    setRestore(null);
    setOperationMessage('Study records restored.');
    notify('Backup restored.', () => {
      let restored = false;
      update(current => {
        if (JSON.stringify(current) !== signature) return current;
        restored = true;
        return previous;
      });
      if (!restored) notify('Your records changed after the restore. Export them before restoring another copy.');
    });
  }

  return <section className="api-settings-panel" aria-label="API connections">
    <header className="api-panel-intro"><span className="api-panel-symbol"><PlugZap size={21} /></span><div><h3>Your connections</h3><p>Set up the services you use. You control when anything is shared.</p></div></header>
    <p className="api-key-note"><ShieldCheck size={15} /><span>New keys stay in memory for this tab only. URLs and preferences are remembered; re-enter keys after a reload.</span></p>
    {api.persistenceError && <p role="alert" className="api-error">{api.persistenceError}</p>}
    <div className="api-services">{services.map(service => {
      const info = serviceInfo[service], status = api.statuses[service], open = expanded === service, browserVoice = service === 'voice' && api.voiceOptions.mode === 'browser';
      const statusLabel = browserVoice ? 'Browser voice' : status.state === 'connected' ? 'Connected' : status.state === 'initializing' ? 'Initializing…' : status.state === 'error' ? 'Error' : 'Not tested';
      return <section key={service} className={`api-service ${open ? 'is-expanded' : ''}`}>
        <button type="button" className="api-service-heading" aria-expanded={open} aria-controls={`api-service-${service}`} onClick={() => setExpanded(current => current === service ? null : service)}><span className="api-service-icon"><info.Icon size={18} /></span><span className="api-service-title"><b>{info.title}</b><small>{info.description}</small></span><span className={`api-status is-${browserVoice ? 'idle' : status.state}`}>{status.state === 'initializing' && !browserVoice ? <LoaderCircle size={11} /> : <i />}{statusLabel}</span><ChevronDown size={16} className="api-expand-icon" /></button>
        <div className="api-service-reveal" id={`api-service-${service}`} inert={!open}><div><div className="api-service-body">
          {service === 'llm' ? <>
            <div className="api-field-grid"><label className="api-field">AI provider<SmoothSelect value={api.chat.provider} onChange={event => { const provider = event.target.value as ChatSettingsData['provider']; api.setChat({ ...defaultChatSettings(), provider, endpoint: provider === 'gemini' ? defaultChatSettings().endpoint : 'https://api.openai.com/v1' }); }}><option value="gemini">Google Gemini</option><option value="openai-compatible">OpenAI-compatible API</option></SmoothSelect></label><label className="api-field">Model ID<input value={api.chat.model} onChange={event => api.setChat({ model: event.target.value })} placeholder="Your provider’s text-chat model ID" maxLength={200} autoComplete="off" spellCheck={false} /></label></div>
            {api.chat.provider === 'openai-compatible' && <label className="api-field">API base URL<input value={api.chat.endpoint} onChange={event => api.setChat({ endpoint: event.target.value })} placeholder="https://your-provider.example/v1" type="url" autoComplete="off" spellCheck={false} /></label>}
            <SecretInput label="AI API key" value={api.chat.apiKey} onChange={apiKey => api.setChat({ apiKey })} />
            <p className="api-field-help">Tests model access without sending a message or study material. Chat sends messages only when you press Send. {api.chat.rememberKey && 'Your previously remembered key will be removed from browser storage when you save these settings.'}</p>
          </> : <>
            {service === 'voice' && <div className="api-field-grid"><label className="api-field">Speech service<SmoothSelect value={api.voiceOptions.mode} onChange={event => api.setVoiceOptions({ mode: event.target.value as 'browser' | 'endpoint' })}><option value="browser">Browser speech recognition</option><option value="endpoint">My transcription endpoint</option></SmoothSelect></label><label className="api-field">Spoken language<SmoothSelect value={api.voiceOptions.language} onChange={event => api.setVoiceOptions({ language: event.target.value })}><option value="en-IN">English · India</option><option value="en-US">English · US</option><option value="en-GB">English · UK</option><option value="hi-IN">Hindi</option></SmoothSelect></label></div>}
            {browserVoice ? <p className="api-field-help">No API key is needed. Your browser handles recognition and may send audio to its speech service. Use the microphone in Study Chat to begin; browser support varies.</p> : <><label className="api-field">{service === 'voice' ? 'Transcription' : service === 'calendar' ? 'Calendar bridge' : 'Storage bridge'} URL<input value={api.configs[service as BridgeService].endpoint} onChange={event => api.setConfig(service as BridgeService, { endpoint: event.target.value })} type="url" placeholder="https://your-service.example/verdant" spellCheck={false} autoComplete="off" /></label><SecretInput label={`${info.title} API key (optional)`} value={api.configs[service as BridgeService].apiKey} onChange={apiKey => api.setConfig(service as BridgeService, { apiKey })} /><p className="api-field-help">Use your own Verdant-compatible bridge. Provider keys alone do not enable a service. The endpoint must allow requests from this website.</p><BridgeGuide service={service as BridgeService} /></>}
          </>}
          {!browserVoice && <>
            <p className={`api-connection-message ${status.state === 'error' ? 'api-error' : ''}`} role={status.state === 'error' ? 'alert' : 'status'}>{status.state === 'connected' && <Check size={14} />}{status.message}</p>
            <div className="api-service-actions"><button type="button" className="button primary" disabled={status.state === 'initializing'} onClick={() => void initialize(service)}>{status.state === 'initializing' ? <LoaderCircle size={14} className="api-spin" /> : <PlugZap size={14} />}Test & initialize connection</button>{service === 'llm' && <button type="button" className="button secondary" disabled={status.state === 'initializing'} onClick={() => { if (api.saveChatWithoutTest()) onChatSaved?.({ ...api.chat, rememberKey: false }); }}>Use without testing</button>}<button type="button" className="api-clear-key" onClick={() => api.clearKey(service)}><KeyRound size={12} />Clear key</button></div>
          </>}
          {service === 'calendar' && <div className="api-consumer-actions"><p>Import events as tasks. Re-importing updates those events in your Calendar, Today, and Board views. No events are sent back.</p><button className="button secondary" type="button" disabled={status.state !== 'connected' || !!operation} onClick={() => void runAction('calendar-import')}>{operation === 'calendar-import' ? <LoaderCircle size={14} className="api-spin" /> : <Download size={14} />}Import calendar events</button></div>}
          {service === 'storage' && <div className="api-consumer-actions"><p>Backups include your tasks, notes, mistakes, resources, and study results. Uploaded PDF files, chat history, and API keys are excluded.</p><div className="api-service-actions"><button type="button" className="button secondary" disabled={status.state !== 'connected' || !!operation} onClick={() => void runAction('backup')}>{operation === 'backup' ? <LoaderCircle size={14} className="api-spin" /> : <Upload size={14} />}Back up study records</button><button type="button" className="button secondary" disabled={status.state !== 'connected' || !!operation} onClick={() => void runAction('download')}>{operation === 'download' ? <LoaderCircle size={14} className="api-spin" /> : <Download size={14} />}Review saved backup</button></div></div>}
        </div></div></div>
      </section>;
    })}</div>
    {operationMessage && <p className="api-operation-message" role="status"><Check size={14} />{operationMessage}</p>}
    {operationError && <p className="api-error" role="alert">{operationError}</p>}
    {restore && <div className="api-restore-review"><h4>Review this backup</h4><p>{restore.tasks.length} tasks · {restore.resources.length} resources · {restore.mistakes.length} mistakes</p><p>Restoring replaces your current study records. Uploaded files stay on this device and are not restored by this backup.</p><div className="api-service-actions"><button className="button primary" type="button" onClick={restoreBackup}>Replace study records</button><button className="button secondary" type="button" onClick={() => setRestore(null)}><X size={14} />Cancel</button></div></div>}
  </section>;
}

function BridgeGuide({ service }: { service: BridgeService }) {
  return <details className="api-bridge-guide"><summary>Connection format <ChevronDown size={13} /></summary><p>Your developer can connect a service using these routes. Credentials use an Authorization: Bearer header. Health checks must validate credentials, not just return a public status page.</p><code>GET /health → {'{ "ok": true, "capabilities": ["' + (service === 'voice' ? 'transcription' : service === 'storage' ? 'workspace' : 'calendar') + '"] }'}</code>{service === 'voice' ? <><code>POST /transcribe · multipart fields: audio, language</code><code>Response: {'{ "text": "Recognized words" }'}</code></> : service === 'calendar' ? <><code>GET /events → {'{ "events": [{ "id", "title", "start", "end", "subject" }] }'}</code><p>Use ISO times with a timezone, unique IDs, and an existing subject ID or name. Unknown subjects become uncategorized tasks. Supports timed events up to 24 hours.</p></> : <><code>PUT /workspace · {'{ "version": 1, "workspace": [study records] }'} → {'{ "ok": true }'}</code><code>GET /workspace → the saved version and workspace object</code><p>Use a private authenticated endpoint. Backup happens only when you press Back up study records.</p></>}</details>;
}
