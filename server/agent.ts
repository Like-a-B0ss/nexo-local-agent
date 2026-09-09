import type { AgentMessage } from './types.js';
import { runTool, toolDefinitions, toolLabels } from './tools.js';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
export const MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:0.6b';

const systemPrompt = `Você é Nexo, um agente pessoal local, inteligente e pragmático.
Responda sempre no idioma do usuário. Seja direto, claro e útil, mas com personalidade.
Você opera 100% localmente. Use ferramentas proativamente quando trouxerem precisão ou executarem a intenção.
Nunca diga que salvou, calculou, consultou ou concluiu algo sem realmente usar a ferramenta correspondente.
Não exponha raciocínio interno. Você pode explicar conclusões e ações de forma breve.
Ao listar tarefas, apresente IDs. Quando uma ferramenta falhar, explique com honestidade e ofereça alternativa.`;

interface AgentEvent {
  type: 'status' | 'tool_start' | 'tool_result' | 'token' | 'done' | 'error';
  [key: string]: unknown;
}

export async function checkOllama() {
  const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error('Ollama indisponível');
  const data = await response.json() as { models?: { name: string }[] };
  return { online: true, model: MODEL, installed: data.models?.some((m) => m.name === MODEL || m.name.startsWith(`${MODEL}:`)) ?? false };
}

export async function* runAgent(history: AgentMessage[], signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  const messages: AgentMessage[] = [{ role: 'system', content: systemPrompt }, ...history];
  const usedTools: { name: string; label: string; result: string }[] = [];

  yield { type: 'status', label: 'Analisando sua solicitação' };
  for (let step = 0; step < 6; step += 1) {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, tools: toolDefinitions, stream: false, options: { temperature: 0.55, num_ctx: 16384 } }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`O motor local respondeu ${response.status}`);
    const payload = await response.json() as { message: AgentMessage };
    const assistant = payload.message;
    messages.push(assistant);
    const calls = assistant.tool_calls ?? [];

    if (!calls.length) {
      const content = assistant.content?.trim() || 'Concluído.';
      const chunks = content.match(/\S+\s*/g) ?? [content];
      for (const chunk of chunks) {
        yield { type: 'token', content: chunk };
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
      yield { type: 'done', content, tools: usedTools };
      return;
    }

    for (const call of calls) {
      const name = call.function.name;
      const label = toolLabels[name] ?? `Executando ${name}`;
      yield { type: 'tool_start', name, label, arguments: call.function.arguments };
      let result: string;
      try {
        result = await runTool(name, call.function.arguments ?? {});
      } catch (error) {
        result = JSON.stringify({ error: error instanceof Error ? error.message : 'Falha desconhecida' });
      }
      usedTools.push({ name, label, result });
      messages.push({ role: 'tool', tool_name: name, content: result });
      yield { type: 'tool_result', name, label, result };
    }
    yield { type: 'status', label: 'Organizando o resultado' };
  }
  throw new Error('O agente excedeu o limite seguro de etapas. Tente dividir o pedido.');
}
