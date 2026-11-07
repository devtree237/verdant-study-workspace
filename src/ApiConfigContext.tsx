import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { clearChatApiKey, initializeChatSettingsForSession, loadChatSettings } from './chat-api';
import type { ChatSettingsData } from './chat-api';
import { API_PREFERENCES_KEY, parseApiPreferences, serializeApiPreferences, testBridgeConnection, testChatConnection } from './api-services';
import type { ApiService, BridgeConfigs, BridgeConfig, BridgeService, VoiceOptions } from './api-services';

export type ConnectionStatus = { state: 'idle' | 'initializing' | 'connected' | 'error'; message: string };
const idle = (): ConnectionStatus => ({ state: 'idle', message: 'Not tested in this session' });
const defaultStatuses = (): Record<ApiService, ConnectionStatus> => ({ llm: idle(), voice: idle(), calendar: idle(), storage: idle() });
type ApiConfigValue = {
  configs: BridgeConfigs; chat: ChatSettingsData; statuses: Record<ApiService, ConnectionStatus>;
  voiceOptions: VoiceOptions; persistenceError: string;
  setConfig: (service: BridgeService, patch: Partial<BridgeConfig>) => void;
  setChat: (patch: Partial<ChatSettingsData>) => void;
  setVoiceOptions: (patch: Partial<VoiceOptions>) => void;
  initialize: (service: ApiService) => Promise<boolean>;
  saveChatWithoutTest: () => boolean;
  clearKey: (service: ApiService) => void;
};
const ApiConfigContext = createContext<ApiConfigValue | null>(null);
export function ApiConfigProvider({ children }: { children: ReactNode }) {
  const [preferences] = useState(() => { try { return parseApiPreferences(localStorage.getItem(API_PREFERENCES_KEY)); } catch { return parseApiPreferences(null); } });
  const [configs, setConfigs] = useState(preferences.configs), [voiceOptions, setVoiceOptionsState] = useState(preferences.voiceOptions);
  const [chat, setChatState] = useState(loadChatSettings), [statuses, setStatuses] = useState(defaultStatuses), [persistenceError, setPersistenceError] = useState('');
  const controllers = useRef<Partial<Record<ApiService, AbortController>>>({}), mounted = useRef(true);
  const status = useCallback((service: ApiService, value: ConnectionStatus) => { if (mounted.current) setStatuses(current => ({ ...current, [service]: value })); }, []);
  const invalidate = useCallback((service: ApiService) => { controllers.current[service]?.abort(); delete controllers.current[service]; status(service, idle()); }, [status]);
  useEffect(() => {
    mounted.current = true;
    const read = () => { setChatState(loadChatSettings()); };
    window.addEventListener('verdant:chat-settings-change', read);
    return () => { mounted.current = false; Object.values(controllers.current).forEach(controller => controller?.abort()); controllers.current = {}; window.removeEventListener('verdant:chat-settings-change', read); };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(API_PREFERENCES_KEY, serializeApiPreferences(configs, voiceOptions)); setPersistenceError(''); }
    catch { setPersistenceError('Connection preferences could not be saved. They remain available in this tab.'); }
  }, [configs, voiceOptions]);
  const setConfig = useCallback((service: BridgeService, patch: Partial<BridgeConfig>) => { invalidate(service); setConfigs(current => ({ ...current, [service]: { ...current[service], ...patch } })); }, [invalidate]);
  const setChat = useCallback((patch: Partial<ChatSettingsData>) => { invalidate('llm'); setChatState(current => ({ ...current, ...patch })); }, [invalidate]);
  const setVoiceOptions = useCallback((patch: Partial<VoiceOptions>) => setVoiceOptionsState(current => ({ ...current, ...patch })), []);
  const initialize = useCallback(async (service: ApiService) => {
    controllers.current[service]?.abort();
    const controller = new AbortController(); controllers.current[service] = controller;
    status(service, { state: 'initializing', message: 'Checking the service…' });
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      if (service === 'llm') {
        const checked = await testChatConnection(chat, controller.signal);
        if (controllers.current[service] !== controller || !mounted.current) return false;
        initializeChatSettingsForSession(checked);
      } else {
        const checked = await testBridgeConnection(service, configs[service], controller.signal);
        if (controllers.current[service] !== controller || !mounted.current) return false;
        setConfigs(current => ({ ...current, [service]: checked }));
      }
      if (controller.signal.aborted) throw new DOMException('Connection timed out.', 'AbortError');
      status(service, { state: 'connected', message: service === 'llm' ? 'Model access verified. Your key is ready in this tab.' : 'Connection and supported service verified.' });
      return true;
    } catch (cause) {
      if (controllers.current[service] === controller && mounted.current) status(service, { state: 'error', message: controller.signal.aborted ? 'The connection timed out. Check the URL and try again.' : cause instanceof Error ? cause.message : 'The connection could not be verified.' });
      return false;
    } finally { clearTimeout(timeout); if (controllers.current[service] === controller) delete controllers.current[service]; }
  }, [chat, configs, status]);
  const saveChatWithoutTest = useCallback(() => {
    invalidate('llm');
    try { initializeChatSettingsForSession(chat); status('llm', { state: 'idle', message: 'Ready to use in this tab. Connection has not been verified.' }); return true; }
    catch (cause) { status('llm', { state: 'error', message: cause instanceof Error ? cause.message : 'Settings could not be saved.' }); return false; }
  }, [chat, invalidate, status]);
  const clearKey = useCallback((service: ApiService) => {
    invalidate(service);
    if (service === 'llm') { try { clearChatApiKey(); setChatState(current => ({ ...current, apiKey: '', rememberKey: false })); } catch { status('llm', { state: 'error', message: 'Browser storage blocked clearing the previous key. Check browser permissions.' }); } }
    else setConfigs(current => ({ ...current, [service]: { ...current[service], apiKey: '' } }));
  }, [invalidate, status]);
  return <ApiConfigContext.Provider value={{ configs, chat, statuses, voiceOptions, persistenceError, setConfig, setChat, setVoiceOptions, initialize, saveChatWithoutTest, clearKey }}>{children}</ApiConfigContext.Provider>;
}
export function useApiConfig() { const value = useContext(ApiConfigContext); if (!value) throw new Error('ApiConfigProvider is missing.'); return value; }
