// Atrium SW — ingest replay queue helpers.
//
// Hand-rolled IndexedDB queue for the 'atrium-ingest-replay' background-sync
// tag. The app enqueues payloads when /api/ingest is unreachable (offline,
// transient 5xx). The SW drains the queue on a 'sync' event and POSTs each
// payload to /api/ingest (Pathfinder proxy).
//
// Replay semantics:
//   - 2xx → drop the entry (success)
//   - 5xx → leave for next sync (transient)
//   - 4xx → drop with console warn (poison message; manual review)
//
// Loaded by sw.js via importScripts('/sw-ingest-queue.js'). Exposes globals
// on `self` because service worker scope has no ES module system.

/* eslint-disable no-restricted-globals */

const INGEST_DB_NAME = 'atrium-ingest-replay';
const INGEST_DB_VERSION = 1;
const INGEST_STORE = 'payloads';

function openIngestDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(INGEST_DB_NAME, INGEST_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(INGEST_STORE)) {
        db.createObjectStore(INGEST_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllPendingIngest(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INGEST_STORE, 'readonly');
    const req = tx.objectStore(INGEST_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function deletePendingIngest(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INGEST_STORE, 'readwrite');
    const req = tx.objectStore(INGEST_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function flushIngestReplayQueue() {
  let db;
  try {
    db = await openIngestDB();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[atrium-sw] ingest-replay: openDB failed', err);
    return;
  }

  const pending = await getAllPendingIngest(db);
  for (const record of pending) {
    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record.payload),
      });

      if (response.ok) {
        // 2xx — drop on success.
        await deletePendingIngest(db, record.id);
      } else if (response.status >= 400 && response.status < 500) {
        // 4xx — poison; drop and log so the queue doesn't loop forever.
        // eslint-disable-next-line no-console
        console.warn(
          '[atrium-sw] ingest-replay: dropping 4xx payload',
          record.id,
          response.status,
        );
        await deletePendingIngest(db, record.id);
      }
      // 5xx — leave in queue for next sync.
    } catch (err) {
      // Network still unavailable — leave in queue, sync will retry.
      // eslint-disable-next-line no-console
      console.warn('[atrium-sw] ingest-replay: network error, retain', record.id, err);
    }
  }
}

self.flushIngestReplayQueue = flushIngestReplayQueue;
