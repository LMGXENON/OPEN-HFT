/**
 * Open-HRT Persistent Session Library (IndexedDB)
 * Stores recorded and imported .hbr backtest archives in the browser
 * for instant one-click switching and management.
 */

export interface LibrarySessionSummary {
  id: string;
  name: string;
  symbol: string;
  recordedAt: number;
  durationSec: number;
  fillsCount: number;
  eventCount: number;
  totalPnl: number;
  sizeBytes: number;
}

export interface LibrarySessionRecord extends LibrarySessionSummary {
  buffer: ArrayBuffer;
}

const DB_NAME = "OpenHrtDB";
const STORE_NAME = "sessions";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("symbol", "symbol", { unique: false });
        store.createIndex("recordedAt", "recordedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSessionToLibrary(
  session: Omit<LibrarySessionSummary, "id" | "sizeBytes"> & { buffer: ArrayBuffer; id?: string }
): Promise<string> {
  const db = await openDb();
  const id = session.id || `rec_${session.symbol}_${Date.now()}`;
  const record: LibrarySessionRecord = {
    ...session,
    id,
    sizeBytes: session.buffer.byteLength,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error);
  });
}

export async function listSessionsFromLibrary(): Promise<LibrarySessionSummary[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = req.result as LibrarySessionRecord[];
      // Return summaries without the heavy array buffers
      const summaries: LibrarySessionSummary[] = records.map((r) => ({
        id: r.id,
        name: r.name,
        symbol: r.symbol,
        recordedAt: r.recordedAt,
        durationSec: r.durationSec,
        fillsCount: r.fillsCount,
        eventCount: r.eventCount,
        totalPnl: r.totalPnl,
        sizeBytes: r.sizeBytes || r.buffer?.byteLength || 0,
      }));
      summaries.sort((a, b) => b.recordedAt - a.recordedAt);
      resolve(summaries);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getSessionBufferFromLibrary(id: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const res = req.result as LibrarySessionRecord | undefined;
      resolve(res ? res.buffer : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSessionFromLibrary(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function downloadSessionFile(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".hbr") ? filename : `${filename}.hbr`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

