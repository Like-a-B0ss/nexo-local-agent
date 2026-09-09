import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChatSession, Database } from './types.js';

const dataDir = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'nexo.json');
const emptyDb = (): Database => ({ sessions: [], memories: [], tasks: [] });
let queue = Promise.resolve();

export async function readDb(): Promise<Database> {
  try {
    return JSON.parse(await readFile(dbPath, 'utf8')) as Database;
  } catch {
    return emptyDb();
  }
}

export async function updateDb<T>(mutate: (db: Database) => T | Promise<T>): Promise<T> {
  let result!: T;
  queue = queue.then(async () => {
    await mkdir(dataDir, { recursive: true });
    const db = await readDb();
    result = await mutate(db);
    const tempPath = `${dbPath}.tmp`;
    await writeFile(tempPath, JSON.stringify(db, null, 2), 'utf8');
    await rename(tempPath, dbPath);
  });
  await queue;
  return result;
}

export async function getSession(id: string): Promise<ChatSession | undefined> {
  return (await readDb()).sessions.find((session) => session.id === id);
}
