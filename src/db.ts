import Dexie from 'dexie';
import type { Table } from 'dexie';

type StoredValue = { key: string; value: unknown; updatedAt: number };
class VerdantDatabase extends Dexie {
  records!: Table<StoredValue, string>;
  constructor() {
    super('verdant-data');
    this.version(1).stores({ records: '&key,updatedAt' });
  }
}

export const db = new VerdantDatabase();
export const WORKSPACE_STORAGE_KEY = 'verdant.workspace.v1';
const writes = new Map<string, Promise<void>>();

/** Structured values and Blobs stay in IndexedDB, outside localStorage's limit. */
export async function getStoredValue<T>(key: string): Promise<T | undefined> {
  await writes.get(key)?.catch(() => {});
  return (await db.records.get(key))?.value as T | undefined;
}

/** Per-key serialization prevents a slower old save from replacing a newer one. */
export function setStoredValue<T>(key: string, value: T): Promise<void> {
  const snapshot = structuredClone(value);
  const next = (writes.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    await db.records.put({ key, value: snapshot, updatedAt: Date.now() });
  });
  writes.set(key, next);
  void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => {});
  return next;
}

export function deleteStoredValue(key: string): Promise<void> {
  const next = (writes.get(key) || Promise.resolve()).catch(() => {}).then(() => db.records.delete(key));
  writes.set(key, next);
  void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => {});
  return next;
}
