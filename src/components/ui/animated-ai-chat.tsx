import type { ChatSettingsData } from '../../chat-api';
import { ApiSettingsPanel } from '../../ApiSettingsPanel';
import { FullPageStudyChat } from '../../chat-workspace';
import '../../chat.css';

export function ChatSettings({ onSaved, onClose }: { onSaved?: (settings: ChatSettingsData) => void; onClose?: () => void }) {
  return <div className="chat-settings"><div className="modal-body"><ApiSettingsPanel services={['llm']} onChatSaved={onSaved} /></div>{onClose && <footer className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Done</button></footer>}</div>;
}
export function StudyChat() { return <FullPageStudyChat SettingsComponent={ChatSettings} />; }
export const AnimatedAIChat = StudyChat;
export default StudyChat;
