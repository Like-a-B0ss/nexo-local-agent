import os from 'node:os';
import { evaluate } from 'mathjs';
import { readDb, updateDb } from './store.js';

export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Calcula com precisão uma expressão matemática. Use para qualquer cálculo.',
      parameters: { type: 'object', properties: { expression: { type: 'string', description: 'Expressão, ex: (1250 * 1.12) / 10' } }, required: ['expression'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'current_datetime',
      description: 'Obtém data e hora atual local.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Salva uma informação duradoura quando o usuário pede para lembrar.',
      parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall_memories',
      description: 'Consulta fatos salvos anteriormente sobre o usuário e suas preferências.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_tasks',
      description: 'Lista, cria ou conclui tarefas locais do usuário.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'complete'] },
          title: { type: 'string', description: 'Título ao criar' },
          task_id: { type: 'string', description: 'ID ao concluir' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'system_info',
      description: 'Consulta informações básicas desta máquina local.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

export const toolLabels: Record<string, string> = {
  calculate: 'Calculando',
  current_datetime: 'Consultando relógio',
  remember: 'Salvando na memória',
  recall_memories: 'Consultando memória',
  manage_tasks: 'Organizando tarefas',
  system_info: 'Lendo sistema',
};

export async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'calculate': {
      const expression = String(args.expression ?? '');
      if (!/^[0-9+\-*/().,%^\s]+$/.test(expression)) throw new Error('Expressão contém caracteres não permitidos.');
      return JSON.stringify({ expression, result: evaluate(expression) });
    }
    case 'current_datetime':
      return JSON.stringify({ iso: new Date().toISOString(), local: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'long' }).format(new Date()) });
    case 'remember': {
      const text = String(args.text ?? '').trim().slice(0, 1000);
      if (!text) throw new Error('A memória está vazia.');
      const item = { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() };
      await updateDb((db) => { db.memories.push(item); });
      return JSON.stringify({ saved: true, memory: item });
    }
    case 'recall_memories':
      return JSON.stringify({ memories: (await readDb()).memories.slice(-20) });
    case 'manage_tasks': {
      const action = String(args.action);
      if (action === 'list') return JSON.stringify({ tasks: (await readDb()).tasks });
      if (action === 'create') {
        const title = String(args.title ?? '').trim().slice(0, 300);
        if (!title) throw new Error('O título da tarefa está vazio.');
        const task = { id: crypto.randomUUID().slice(0, 8), title, done: false, createdAt: new Date().toISOString() };
        await updateDb((db) => { db.tasks.push(task); });
        return JSON.stringify({ created: task });
      }
      if (action === 'complete') {
        let completed = false;
        await updateDb((db) => {
          const task = db.tasks.find((item) => item.id === String(args.task_id));
          if (task) { task.done = true; completed = true; }
        });
        return JSON.stringify({ completed });
      }
      throw new Error('Ação inválida.');
    }
    case 'system_info':
      return JSON.stringify({ platform: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, cores: os.cpus().length, totalMemoryGb: +(os.totalmem() / 1024 ** 3).toFixed(1), freeMemoryGb: +(os.freemem() / 1024 ** 3).toFixed(1) });
    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}
