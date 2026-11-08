import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArchiveRestore, ArrowUpRight, Bell, Check, ChevronDown, ChevronRight, Copy, Download, Folder, FolderPlus, Link, MoreHorizontal, PanelLeftClose, Pencil, Pin, Plus, Search, Settings2, Share2, SquarePen, Tag, Trash2, X } from 'lucide-react';
import type { Conversation } from './chat-api';
import { conversationLink, conversationText, organizeConversation, sortConversations } from './chat-organization';
import type { ConversationPatch } from './chat-organization';
import { Modal } from './ui';
import './chat-sidebar.css';

type Props = {
  chats: Conversation[];
  activeId: string | null;
  loaded: boolean;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string | null) => void;
  onNew: (project?: string) => void;
  onUpdate: (update: (current: Conversation[]) => Conversation[]) => void;
  onExport: () => void;
  onSettings: () => void;
  notify: (message: string, undo?: () => void) => void;
};
type Dialog = { kind: 'rename' | 'project' | 'section' | 'share' | 'copy' | 'delete'; id?: string };
type MenuState = { id: string | 'workspace'; left: number; top: number };

function downloadConversation(chat: Conversation) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, conversations: [chat] }, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${chat.title.replace(/[^a-z0-9 -]/gi, '').trim().slice(0, 60) || 'conversation'}.json`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ChatSidebar({ chats, activeId, loaded, open, onClose, onSelect, onNew, onUpdate, onExport, onSettings, notify }: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'all' | 'unread' | 'archive'>('all');
  const [recentsOpen, setRecentsOpen] = useState(true);
  const [collapsedProjects, setCollapsedProjects] = useState<string[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const unreadCount = chats.filter(chat => chat.unread && !chat.archived).length;
  const projectNames = [...new Set(chats.filter(chat => !chat.archived).map(chat => chat.project).filter((name): name is string => !!name))].sort();
  const sectionNames = [...new Set(chats.filter(chat => !chat.archived).map(chat => chat.section).filter((name): name is string => !!name))].sort();
  const visible = sortConversations(chats.filter(chat => (view === 'archive' ? chat.archived : !chat.archived) && (view !== 'unread' || chat.unread) && `${chat.title} ${chat.project || ''} ${chat.section || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())));
  const selected = dialog?.id ? chats.find(chat => chat.id === dialog.id) : undefined;
  const menuChat = menu?.id !== 'workspace' ? chats.find(chat => chat.id === menu?.id) : undefined;

  function patch(id: string, changes: ConversationPatch) {
    onUpdate(current => organizeConversation(current, id, changes));
  }
  function closeMenu(restoreFocus = true) {
    setMenu(null);
    if (restoreFocus) menuTrigger.current?.focus();
  }
  function openMenu(id: string, trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    menuTrigger.current = trigger;
    setMenu({ id, left: Math.max(8, Math.min(rect.left, window.innerWidth - 272)), top: Math.min(rect.bottom + 7, Math.max(8, window.innerHeight - (id === 'workspace' ? 220 : 414))) });
  }
  function openDialog(kind: Dialog['kind'], chat?: Conversation) {
    closeMenu(false);
    setDialog({ kind, id: chat?.id });
    setDraft(kind === 'rename' ? chat?.title || '' : kind === 'project' ? chat?.project || '' : kind === 'section' ? chat?.section || '' : '');
    setFormError('');
  }
  function saveDialog() {
    const value = draft.trim();
    if (!value || /[\u0000-\u001f]/.test(value)) { setFormError('Enter a name on one line.'); return; }
    if (value.length > (dialog?.kind === 'rename' ? 150 : 80)) { setFormError('Use a shorter name.'); return; }
    if (dialog?.kind === 'rename' && selected) patch(selected.id, { title: value });
    if (dialog?.kind === 'project') {
      if (selected) patch(selected.id, { project: value });
      else onNew(value);
    }
    if (dialog?.kind === 'section' && selected) patch(selected.id, { section: value });
    setDialog(null);
  }
  async function copyText(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); notify(label); setDialog(null); }
    catch { setFormError('Clipboard access is unavailable. Download this conversation instead.'); }
  }
  function toggleArchive(chat: Conversation) {
    closeMenu(false);
    patch(chat.id, { archived: !chat.archived });
    if (!chat.archived && activeId === chat.id) onSelect(null);
    notify(chat.archived ? 'Conversation restored' : 'Conversation archived', () => patch(chat.id, { archived: !!chat.archived }));
  }
  function chooseView(next: typeof view) {
    setView(next);
    closeMenu(false);
    setRecentsOpen(true);
  }

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    if (!open) setMenu(null);
  }, [open]);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !menuTrigger.current?.contains(event.target as Node)) closeMenu(false);
    };
    const reposition = () => closeMenu(false);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', reposition);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', reposition); };
  }, [menu]);

  function menuItem(label: string, icon: ReactNode, action: () => void, trailing?: ReactNode) {
    return <button type="button" role="menuitem" onClick={action}>{icon}<span>{label}</span>{trailing}</button>;
  }
  function row(chat: Conversation, nested = false) {
    return <div className={`study-chat-row ${activeId === chat.id ? 'is-active' : ''} ${nested ? 'is-nested' : ''}`} key={chat.id}>
      <button type="button" className="study-chat-row-link" onClick={() => onSelect(chat.id)} aria-current={activeId === chat.id ? 'page' : undefined} title={chat.title}>
        <span className="study-chat-row-title">{chat.title}</span>
        {chat.unread && <i className="study-chat-unread-dot" aria-label="Unread" />}
      </button>
      <div className="study-chat-row-actions">
        <button type="button" aria-label={`Options for ${chat.title}`} aria-haspopup="menu" aria-expanded={menu?.id === chat.id} onClick={event => openMenu(chat.id, event.currentTarget)}><MoreHorizontal size={16} /></button>
        <button type="button" className={chat.pinned ? 'is-pinned' : ''} aria-label={`${chat.pinned ? 'Unpin' : 'Pin'} ${chat.title}`} aria-pressed={!!chat.pinned} onClick={() => patch(chat.id, { pinned: !chat.pinned })}><Pin size={13} /></button>
      </div>
    </div>;
  }

  return <>
    <aside className="chat-history study-chat-sidebar" aria-label="Conversation history" hidden={!open}>
      <div className="study-chat-sidebar-top">
        <button type="button" className="study-chat-brand" aria-haspopup="menu" aria-expanded={menu?.id === 'workspace'} onClick={event => openMenu('workspace', event.currentTarget)}>Study Chat<ChevronDown size={13} /></button>
        <div className="study-chat-header-tools">
          <button type="button" className={view === 'unread' ? 'is-selected' : ''} aria-label={`Unread conversations${unreadCount ? `, ${unreadCount}` : ''}`} aria-pressed={view === 'unread'} title="Unread conversations" onClick={() => chooseView(view === 'unread' ? 'all' : 'unread')}><Bell size={17} />{unreadCount > 0 && <i />}</button>
          <button type="button" aria-label="Search conversations" aria-expanded={searchOpen} onClick={() => { setSearchOpen(current => !current); setQuery(''); }}><Search size={17} /></button>
          <button type="button" aria-label="Collapse conversation history" onClick={onClose}><PanelLeftClose size={16} /></button>
        </div>
      </div>
      <button type="button" className="study-chat-new" disabled={!loaded} onClick={() => { if (view === 'archive') setView('all'); onNew(); }}><SquarePen size={18} /><span>New chat</span></button>
      {searchOpen && <label className="study-chat-search"><Search size={15} /><input ref={searchRef} aria-label="Search chat histories" placeholder="Search conversations" value={query} onChange={event => setQuery(event.target.value)} /><button type="button" aria-label="Close search" onClick={() => { setSearchOpen(false); setQuery(''); }}><X size={14} /></button></label>}
      {view !== 'all' && <div className="study-chat-view-label"><span>{view === 'archive' ? 'Archived conversations' : 'Unread conversations'}</span><button type="button" aria-label="Show all conversations" onClick={() => setView('all')}><X size={14} /></button></div>}
      <div className="study-chat-sidebar-scroll">
        {!loaded ? <p className="study-chat-empty" role="status">Opening saved conversations…</p> : <>
          {view === 'all' && !query && <section className="study-chat-projects" aria-label="Projects">
            <div className="study-chat-section-heading"><h3>Projects</h3><button type="button" aria-label="Create a chat project" onClick={() => openDialog('project')}><FolderPlus size={15} /></button></div>
            {projectNames.length === 0 && <button type="button" className="study-chat-add-project" onClick={() => openDialog('project')}><FolderPlus size={17} />New project</button>}
            {projectNames.map(name => {
              const expanded = !collapsedProjects.includes(name);
              const projectChats = visible.filter(chat => chat.project === name);
              return <div className="study-chat-project" key={name}>
                <div className="study-chat-project-heading"><button type="button" onClick={() => setCollapsedProjects(current => expanded ? [...current, name] : current.filter(item => item !== name))} aria-expanded={expanded}><Folder size={18} /><span>{name}</span><ChevronRight size={13} className={expanded ? 'is-expanded' : ''} /></button><button type="button" aria-label={`New chat in ${name}`} onClick={() => onNew(name)}><Plus size={14} /></button></div>
                <div className={`study-chat-project-content ${expanded ? 'is-open' : ''}`} inert={!expanded} aria-hidden={!expanded}><div>{projectChats.map(chat => row(chat, true))}</div></div>
              </div>;
            })}
          </section>}
          <section className="study-chat-recents" aria-label={view === 'archive' ? 'Archived conversations' : 'Recent conversations'}>
            <button type="button" className="study-chat-recents-heading" aria-expanded={recentsOpen} onClick={() => setRecentsOpen(current => !current)}>{query ? 'Search results' : view === 'archive' ? 'Archived' : view === 'unread' ? 'Unread' : 'Recents'}<ChevronDown size={13} className={recentsOpen ? '' : 'is-collapsed'} /></button>
            {recentsOpen && <div className="study-chat-recents-content">
              {!visible.length && <p className="study-chat-empty">{query ? 'No matching conversations.' : view === 'archive' ? 'Archived chats will appear here.' : view === 'unread' ? 'You’re all caught up.' : 'Start a chat to keep your study conversations here.'}</p>}
              {visible.filter(chat => !chat.section).map(chat => row(chat))}
              {[...new Set(visible.map(chat => chat.section).filter((name): name is string => !!name))].sort().map(name => <div className="study-chat-custom-section" key={name}><h4><Tag size={12} />{name}</h4>{visible.filter(chat => chat.section === name).map(chat => row(chat))}</div>)}
            </div>}
          </section>
        </>}
      </div>
      <footer className="study-chat-sidebar-footer"><span><i />Saved on this device</span><button type="button" aria-label="Chat settings and history actions" aria-haspopup="menu" aria-expanded={menu?.id === 'workspace'} onClick={event => openMenu('workspace', event.currentTarget)}><MoreHorizontal size={18} /></button></footer>
    </aside>

    {menu && createPortal(<div className="study-chat-nav-menu" ref={menuRef} role="menu" aria-label={menuChat ? `Conversation actions for ${menuChat.title}` : 'Study Chat actions'} style={{ left: menu.left, top: menu.top }} onKeyDown={event => {
      const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
      if (event.key === 'Tab') closeMenu(false);
    }}>
      {menu.id === 'workspace' ? <>
        {menuItem('All conversations', <SquarePen size={16} />, () => chooseView('all'), view === 'all' && <Check size={14} />)}
        {menuItem('Unread conversations', <Bell size={16} />, () => chooseView('unread'), view === 'unread' && <Check size={14} />)}
        {menuItem('Archived conversations', <Archive size={16} />, () => chooseView('archive'), view === 'archive' && <Check size={14} />)}
        <hr />
        {menuItem('Export all chats', <Download size={16} />, () => { closeMenu(); onExport(); })}
        {menuItem('Chat & API settings', <Settings2 size={16} />, () => { closeMenu(); onSettings(); })}
      </> : menuChat && <>
        {menuItem('Rename', <Pencil size={16} />, () => openDialog('rename', menuChat))}
        {menuItem(menuChat.pinned ? 'Unpin' : 'Pin', <Pin size={16} />, () => { patch(menuChat.id, { pinned: !menuChat.pinned }); closeMenu(); })}
        {menuItem(menuChat.unread ? 'Mark as read' : 'Mark as unread', <Bell size={16} />, () => { patch(menuChat.id, { unread: !menuChat.unread }); closeMenu(); })}
        {menuItem('Project', <Folder size={16} />, () => openDialog('project', menuChat), <ChevronRight size={14} />)}
        {menuItem('Section', <Tag size={16} />, () => openDialog('section', menuChat), <ChevronRight size={14} />)}
        <hr />
        {menuItem('Share', <Share2 size={16} />, () => openDialog('share', menuChat))}
        {menuItem('Copy', <Copy size={16} />, () => openDialog('copy', menuChat), <ChevronRight size={14} />)}
        {menuItem('Open in new window', <ArrowUpRight size={16} />, () => { window.open(conversationLink(menuChat.id, window.location.href), '_blank', 'noopener,noreferrer'); closeMenu(); })}
        <hr />
        {menuItem(menuChat.archived ? 'Restore conversation' : 'Archive', menuChat.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />, () => toggleArchive(menuChat))}
        {menuChat.archived && menuItem('Delete permanently', <Trash2 size={16} />, () => openDialog('delete', menuChat))}
      </>}
    </div>, document.body)}

    {dialog && <Modal title={dialog.kind === 'rename' ? 'Rename conversation' : dialog.kind === 'project' ? selected ? 'Move to project' : 'Create a project' : dialog.kind === 'section' ? 'Organize into a section' : dialog.kind === 'share' ? 'Share conversation' : dialog.kind === 'copy' ? 'Copy conversation' : 'Delete conversation?'} onClose={() => setDialog(null)}>
      <div className="study-chat-sidebar-dialog">
        {['rename', 'project', 'section'].includes(dialog.kind) ? <form onSubmit={event => { event.preventDefault(); saveDialog(); }}>
          <p>{dialog.kind === 'project' ? selected ? 'Keep related conversations together in a project.' : 'Give your project a name. A new chat will open inside it.' : dialog.kind === 'section' ? 'Sections organize your recent conversations.' : 'Choose a name that’s easy to find again.'}</p>
          <label>{dialog.kind === 'rename' ? 'Conversation name' : dialog.kind === 'project' ? 'Project name' : 'Section name'}<input autoFocus value={draft} maxLength={dialog.kind === 'rename' ? 150 : 80} placeholder={dialog.kind === 'rename' ? 'Conversation name' : 'Enter a name'} onChange={event => setDraft(event.target.value)} /></label>
          {dialog.kind !== 'rename' && (dialog.kind === 'project' ? projectNames : sectionNames).length > 0 && <div className="study-chat-existing-groups" aria-label="Existing groups">{(dialog.kind === 'project' ? projectNames : sectionNames).map(name => <button type="button" key={name} className={draft === name ? 'is-selected' : ''} onClick={() => setDraft(name)}>{dialog.kind === 'project' ? <Folder size={14} /> : <Tag size={14} />}{name}</button>)}</div>}
          {formError && <p className="study-chat-dialog-error" role="alert">{formError}</p>}
          <div className="study-chat-dialog-actions">{selected && dialog.kind !== 'rename' && selected[dialog.kind as 'project' | 'section'] && <button type="button" className="study-chat-dialog-text" onClick={() => { patch(selected.id, { [dialog.kind]: undefined }); setDialog(null); }}>Remove from {dialog.kind}</button>}<button type="button" onClick={() => setDialog(null)}>Cancel</button><button type="submit" className="is-primary">{dialog.kind === 'rename' ? 'Save name' : selected ? 'Save' : 'Create project'}</button></div>
        </form> : selected && dialog.kind === 'delete' ? <>
          <p>This permanently removes “{selected.title}” from this device. Export a copy first if you need it.</p>
          <div className="study-chat-dialog-actions"><button type="button" onClick={() => downloadConversation(selected)}><Download size={15} />Export</button><button type="button" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="is-danger" onClick={() => { onUpdate(current => current.filter(chat => chat.id !== selected.id)); if (activeId === selected.id) onSelect(null); setDialog(null); notify('Conversation deleted'); }}>Delete</button></div>
        </> : selected && <>
          <p>{dialog.kind === 'share' ? 'Choose how to share this conversation. The export includes its messages, attachments and workspace context.' : 'Copy the full conversation, including any attached text and selected workspace context.'}</p>
          <div className="study-chat-share-actions">
            <button type="button" onClick={() => void copyText(conversationText(selected), 'Conversation copied')}><Copy size={17} /><span>Copy conversation<small>Plain text, ready to paste</small></span></button>
            <button type="button" onClick={() => downloadConversation(selected)}><Download size={17} /><span>Download conversation<small>A complete JSON backup</small></span></button>
            {dialog.kind === 'copy' && <button type="button" onClick={() => void copyText(conversationLink(selected.id, window.location.href), 'Device-local conversation link copied')}><Link size={17} /><span>Copy device-local link<small>Opens only where this chat is saved</small></span></button>}
            {dialog.kind === 'share' && typeof navigator.share === 'function' && <button type="button" onClick={() => { void navigator.share({ title: selected.title, text: conversationText(selected) }).then(() => setDialog(null)).catch(error => { if (error?.name !== 'AbortError') setFormError('Your device could not share this conversation. Copy or download it instead.'); }); }}><Share2 size={17} /><span>Share with an app<small>Choose a destination on your device</small></span></button>}
          </div>
          {formError && <p className="study-chat-dialog-error" role="alert">{formError}</p>}
        </>}
      </div>
    </Modal>}
  </>;
}
