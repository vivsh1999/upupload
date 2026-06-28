/** @module react/persistence */

const DEFAULT_DB_NAME = "upupload";
const STORE_NAME = "queue";
const DB_VERSION = 1;

interface StoredItem {
  id: string;
  name: string;
  status: string;
  progress: number;
  error?: string;
  meta?: unknown;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileLastModified: number;
  artifacts?: { variant: string; filename: string }[];
  needsReselect?: boolean;
}

/**
 * Build the IndexedDB database name from an optional storage key prefix.
 * Allows consumers to namespace storage (e.g. per-account or per-project) so
 * they can manage cleanup independently.
 */
export function buildDbName(prefix?: string): string {
  return prefix ? `${prefix}-upupload` : DEFAULT_DB_NAME;
}

function openDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function serializeForStorage<TMeta>(
  items: {
    id: string;
    name: string;
    status: string;
    progress: number;
    error?: string;
    meta?: TMeta;
    file?: File;
    artifacts?: { variant: string; filename: string }[];
    needsReselect?: boolean;
  }[],
): StoredItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    progress: item.progress,
    ...(item.error !== undefined ? { error: item.error } : {}),
    meta: item.meta as unknown,
    fileName: item.file?.name ?? item.name,
    fileSize: item.file?.size ?? 0,
    fileType: item.file?.type ?? "",
    fileLastModified: item.file?.lastModified ?? 0,
    ...(item.artifacts?.length
      ? { artifacts: item.artifacts.map((a) => ({ variant: a.variant, filename: a.filename })) }
      : {}),
    ...(item.needsReselect !== undefined ? { needsReselect: item.needsReselect } : {}),
  }));
}

export async function saveQueue(
  serialized: StoredItem[],
  dbName: string = DEFAULT_DB_NAME,
): Promise<void> {
  const db = await openDB(dbName);
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  for (const item of serialized) {
    store.put(item);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadQueue(dbName: string = DEFAULT_DB_NAME): Promise<StoredItem[]> {
  const db = await openDB(dbName);
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const all = store.getAll();
  return new Promise((resolve, reject) => {
    all.onsuccess = () => resolve(all.result as StoredItem[]);
    all.onerror = () => reject(all.error);
  });
}

export async function clearQueue(dbName: string = DEFAULT_DB_NAME): Promise<void> {
  const db = await openDB(dbName);
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
