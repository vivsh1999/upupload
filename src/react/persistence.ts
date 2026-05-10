/** @module react/persistence */

const DB_NAME = "upupload";
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

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
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
    file: File;
    artifacts?: { variant: string; filename: string }[];
    needsReselect?: boolean;
  }[],
): StoredItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    progress: item.progress,
    error: item.error,
    meta: item.meta as unknown,
    fileName: item.file.name,
    fileSize: item.file.size,
    fileType: item.file.type,
    fileLastModified: item.file.lastModified,
    artifacts: item.artifacts?.map((a) => ({ variant: a.variant, filename: a.filename })),
    needsReselect: item.needsReselect,
  }));
}

export async function saveQueue(serialized: StoredItem[]): Promise<void> {
  const db = await openDB();
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

export async function loadQueue(): Promise<StoredItem[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const all = store.getAll();
  return new Promise((resolve, reject) => {
    all.onsuccess = () => resolve(all.result as StoredItem[]);
    all.onerror = () => reject(all.error);
  });
}

export async function clearQueue(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
