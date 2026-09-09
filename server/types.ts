export type Role = 'user' | 'assistant' | 'tool';

export interface ToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

export interface AgentMessage {
  role: Role | 'system';
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  tools?: { name: string; label: string; result: string }[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface Database {
  sessions: ChatSession[];
  memories: { id: string; text: string; createdAt: string }[];
  tasks: { id: string; title: string; done: boolean; createdAt: string }[];
}
