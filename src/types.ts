export interface ToolUse { name: string; label: string; result?: string }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; createdAt: string; tools?: ToolUse[] }
export interface Session { id: string; title: string; createdAt: string; updatedAt: string; messages?: Message[]; messageCount?: number }
export interface StreamEvent { type: 'status' | 'tool_start' | 'tool_result' | 'token' | 'done' | 'error'; label?: string; name?: string; content?: string; result?: string; message?: string; tools?: ToolUse[] }
