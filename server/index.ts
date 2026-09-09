import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkOllama, MODEL, runAgent } from './agent.js';
import { getSession, readDb, updateDb } from './store.js';
import type { AgentMessage, ChatMessage, ChatSession } from './types.js';

const app = express();
const port = Number(process.env.PORT ?? 3333);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try { res.json({ ok: true, ...(await checkOllama()) }); }
  catch { res.status(503).json({ ok: false, online: false, installed: false, model: MODEL }); }
});

app.get('/api/sessions', async (_req, res) => {
  const sessions = (await readDb()).sessions
    .map(({ messages, ...session }) => ({ ...session, messageCount: messages.length }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json(sessions);
});

app.post('/api/sessions', async (_req, res) => {
  const now = new Date().toISOString();
  const session: ChatSession = { id: crypto.randomUUID(), title: 'Nova conversa', createdAt: now, updatedAt: now, messages: [] };
  await updateDb((db) => { db.sessions.push(session); });
  res.status(201).json(session);
});

app.get('/api/sessions/:id', async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Conversa não encontrada' });
  res.json(session);
});

app.delete('/api/sessions/:id', async (req, res) => {
  await updateDb((db) => { db.sessions = db.sessions.filter((item) => item.id !== req.params.id); });
  res.status(204).end();
});

app.post('/api/chat', async (req, res) => {
  const { sessionId, message } = req.body as { sessionId?: string; message?: string };
  if (!sessionId || !message?.trim()) return res.status(400).json({ error: 'sessionId e message são obrigatórios' });
  const session = await getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Conversa não encontrada' });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const controller = new AbortController();
  let completed = false;
  res.on('close', () => { if (!completed) controller.abort(); });
  const send = (event: unknown) => res.write(`${JSON.stringify(event)}\n`);

  const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: message.trim(), createdAt: new Date().toISOString() };
  await updateDb((db) => {
    const target = db.sessions.find((item) => item.id === sessionId)!;
    target.messages.push(userMessage);
    target.updatedAt = userMessage.createdAt;
    if (target.messages.length === 1) target.title = message.trim().replace(/\s+/g, ' ').slice(0, 42);
  });

  try {
    const latest = await getSession(sessionId);
    const history: AgentMessage[] = (latest?.messages ?? []).slice(-24).map((item) => ({ role: item.role, content: item.content }));
    let finalContent = '';
    let tools: ChatMessage['tools'] = [];
    for await (const event of runAgent(history, controller.signal)) {
      send(event);
      if (event.type === 'done') {
        finalContent = String(event.content);
        tools = event.tools as ChatMessage['tools'];
      }
    }
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: finalContent, createdAt: new Date().toISOString(), tools };
    await updateDb((db) => {
      const target = db.sessions.find((item) => item.id === sessionId);
      if (target) { target.messages.push(assistantMessage); target.updatedAt = assistantMessage.createdAt; }
    });
  } catch (error) {
    if (!controller.signal.aborted) send({ type: 'error', message: error instanceof Error ? error.message : 'Falha no agente local' });
  } finally {
    completed = true;
    res.end();
  }
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticDir = path.join(root, 'dist');
app.use(express.static(staticDir));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));

app.listen(port, '0.0.0.0', () => console.log(`Nexo API em http://localhost:${port}`));
