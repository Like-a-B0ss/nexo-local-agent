import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, Bot, Brain, Check, ChevronDown, CircleStop, Clock3, Command, Cpu, Menu, MessageSquare, Plus, Search, Sparkles, Trash2, Wrench, X, Zap } from 'lucide-react';
import type { Message, Session, StreamEvent, ToolUse } from './types';

const suggestions = [
  { icon: Brain, title: 'Lembre de mim', text: 'Lembre que prefiro respostas diretas e exemplos práticos.' },
  { icon: Command, title: 'Organize algo', text: 'Crie três tarefas para planejar meu projeto desta semana.' },
  { icon: Cpu, title: 'Conheça a máquina', text: 'Analise as informações desta máquina e resuma a capacidade dela.' },
  { icon: Sparkles, title: 'Resolva e explique', text: 'Calcule 18% de 4.750 e explique o resultado de forma simples.' },
];

function Logo() {
  return <div className="logo-mark" aria-hidden="true">
    <div className="logo-core" />
    <span className="orbit orbit-a"><i /></span>
    <span className="orbit orbit-b"><i /></span>
  </div>;
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [liveTools, setLiveTools] = useState<ToolUse[]>([]);
  const [online, setOnline] = useState(false);
  const [model, setModel] = useState('qwen3:0.6b');
  const [sidebar, setSidebar] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const refreshSessions = async () => setSessions(await fetch('/api/sessions').then((r) => r.json()));
  const loadSession = async (id: string) => {
    const data = await fetch(`/api/sessions/${id}`).then((r) => r.json()) as Session;
    setActiveId(id); setMessages(data.messages ?? []); setSidebar(false);
  };
  const newChat = async () => {
    const session = await fetch('/api/sessions', { method: 'POST' }).then((r) => r.json()) as Session;
    await refreshSessions(); setActiveId(session.id); setMessages([]); setSidebar(false); inputRef.current?.focus();
  };

  useEffect(() => {
    Promise.all([fetch('/api/health').then(async (r) => ({ ok: r.ok, ...await r.json() })), fetch('/api/sessions').then((r) => r.json())])
      .then(([health, list]) => {
        setOnline(Boolean(health.ok && health.installed)); setModel(health.model); setSessions(list);
        if (list[0]) loadSession(list[0].id); else newChat();
      }).catch(() => { setOnline(false); newChat(); });
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, status, liveTools]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); newChat(); }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  const removeSession = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    const remaining = sessions.filter((session) => session.id !== id);
    setSessions(remaining);
    if (activeId === id) remaining[0] ? loadSession(remaining[0].id) : newChat();
  };

  const send = async (text = input) => {
    const content = text.trim();
    if (!content || running || !activeId) return;
    setInput(''); setRunning(true); setStatus('Conectando ao motor local'); setLiveTools([]);
    const controller = new AbortController(); abortRef.current = controller;
    const optimistic: Message = { id: crypto.randomUUID(), role: 'user', content, createdAt: new Date().toISOString() };
    const assistant: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', createdAt: new Date().toISOString(), tools: [] };
    setMessages((current) => [...current, optimistic, assistant]);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: activeId, message: content }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('Não foi possível iniciar o agente.');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let answer = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === 'status') setStatus(event.label ?? 'Pensando');
          if (event.type === 'tool_start') { setStatus(event.label ?? 'Usando ferramenta'); setLiveTools((items) => [...items, { name: event.name!, label: event.label! }]); }
          if (event.type === 'tool_result') setLiveTools((items) => items.map((tool) => tool.name === event.name ? { ...tool, result: event.result } : tool));
          if (event.type === 'token') { answer += event.content ?? ''; setMessages((current) => current.map((item) => item.id === assistant.id ? { ...item, content: answer } : item)); }
          if (event.type === 'done') setMessages((current) => current.map((item) => item.id === assistant.id ? { ...item, content: event.content ?? answer, tools: event.tools } : item));
          if (event.type === 'error') throw new Error(event.message);
        }
      }
      await refreshSessions();
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      setMessages((current) => current.map((item) => item.id === assistant.id ? { ...item, content: item.content || (aborted ? 'Resposta interrompida.' : `Não consegui concluir: ${error instanceof Error ? error.message : 'erro inesperado'}`) } : item));
    } finally { abortRef.current = undefined; setRunning(false); setStatus(''); setLiveTools([]); }
  };

  return <div className="app-shell">
    <div className={`mobile-scrim ${sidebar ? 'show' : ''}`} onClick={() => setSidebar(false)} />
    <aside className={sidebar ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><Logo /><span>NEXO</span><button className="mobile-close" onClick={() => setSidebar(false)}><X size={18} /></button></div>
      <button className="new-chat" onClick={newChat}><Plus size={18} /> Nova conversa <kbd>⌘ K</kbd></button>
      <div className="search"><Search size={15} /><span>Buscar conversas</span></div>
      <p className="section-label">RECENTES</p>
      <nav className="session-list">
        {sessions.map((session) => <button className={`session-item ${activeId === session.id ? 'active' : ''}`} key={session.id} onClick={() => loadSession(session.id)}>
          <MessageSquare size={16} /><span>{session.title}</span><Trash2 className="trash" size={14} onClick={(e) => removeSession(e, session.id)} />
        </button>)}
      </nav>
      <div className="local-card"><div className="status-row"><span className={`status-dot ${online ? '' : 'off'}`} /><strong>{online ? 'Motor local ativo' : 'Motor indisponível'}</strong></div><span>{model} · privado</span><div className="meter"><i /></div></div>
      <div className="profile"><div className="avatar">L</div><div><strong>Workspace local</strong><span>Seus dados ficam aqui</span></div><ChevronDown size={16} /></div>
    </aside>

    <main>
      <header><button className="menu-btn" onClick={() => setSidebar(true)}><Menu size={20} /></button><div className="header-title"><Bot size={19} /><span>Agente Nexo</span><em>LOCAL</em></div><div className="header-meta"><Zap size={14} /><span>{model}</span></div></header>
      <section className="chat">
        {messages.length === 0 ? <div className="welcome">
          <div className="hero-logo"><Logo /></div>
          <p className="eyebrow"><span /> INTELIGÊNCIA QUE AGE</p>
          <h1>Olá. Eu sou o <span>Nexo.</span></h1>
          <p className="intro">Seu agente pessoal rodando inteiramente nesta máquina.<br />Privado, rápido e pronto para transformar intenção em ação.</p>
          <div className="suggestions">{suggestions.map(({ icon: Icon, title, text }) => <button key={title} onClick={() => send(text)}><Icon size={19} /><div><strong>{title}</strong><span>{text}</span></div><ArrowUp size={15} /></button>)}</div>
          <div className="capabilities"><span><Wrench size={13} /> 6 ferramentas</span><span><Brain size={13} /> memória local</span><span><Clock3 size={13} /> tempo real</span></div>
        </div> : <div className="thread">{messages.map((message) => <article className={`message ${message.role}`} key={message.id}>
          {message.role === 'assistant' && <div className="bot-avatar"><Logo /></div>}
          <div className="message-body">{message.role === 'assistant' && message.tools?.map((tool, index) => <ToolPill tool={tool} key={`${tool.name}-${index}`} />)}
            {message.content ? <ReactMarkdown>{message.content}</ReactMarkdown> : running && message.role === 'assistant' ? <div className="thinking"><i /><i /><i /></div> : null}
          </div>
        </article>)}
        {running && (status || liveTools.length > 0) && <div className="agent-progress"><div className="progress-line"><span className="spinner" />{status}</div>{liveTools.map((tool, index) => <ToolPill tool={tool} key={`${tool.name}-${index}`} />)}</div>}
        <div ref={endRef} /></div>}
      </section>
      <div className="composer-wrap"><div className={`composer ${running ? 'busy' : ''}`}><textarea ref={inputRef} value={input} rows={1} placeholder="Peça algo ao Nexo..." onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} /><button className="send" onClick={() => running ? abortRef.current?.abort() : send()} disabled={!input.trim() && !running} title={running ? 'Interromper' : 'Enviar'}>{running ? <CircleStop size={18} /> : <ArrowUp size={20} />}</button></div><p>Enter para enviar · Shift + Enter para nova linha · tudo processado localmente</p></div>
    </main>
  </div>;
}

function ToolPill({ tool }: { tool: ToolUse }) {
  return <div className={`tool-pill ${tool.result ? 'done' : ''}`}>{tool.result ? <Check size={13} /> : <span className="mini-spinner" />}<span>{tool.label}</span></div>;
}
