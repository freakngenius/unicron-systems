// Atrium Service Worker
// Strategy:
//   - App shell (HTML/CSS/JS): cache-first with versioned cache key
//   - /api/* routes: network-first, no caching
//   - Navigation requests when offline: serve /offline.html fallback
//   - Background sync: voice-memo-sync tag for queued voice memo ingest payloads

// Bumped 2026-05-11 after Pass 2 (8 streams) + logo replacement caused
// stale cache-first JS chunks to linger. Activate handler deletes any
// 'atrium-*' cache that isn't the current shell, forcing a fresh fetch.
const CACHE_VERSION = 'atrium-v2-pass2';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const OFFLINE_URL = '/offline.html';

// Files to pre-cache on install. Vite hashes JS/CSS bundle filenames so we
// pre-cache the root HTML and the offline page; JS/CSS bundles are cached
// dynamically on first fetch via the cache-first handler below.
const PRECACHE_URLS = ['/', OFFLINE_URL];

// ── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('atrium-') && key !== APP_SHELL_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // NETWORK-FIRST: /api/* — never cache dynamic data
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // NETWORK-FIRST: navigation requests — ensures users always get fresh HTML.
  // Fallback to /offline.html when the network is unavailable.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // CACHE-FIRST: static assets (JS, CSS, fonts, images) with Vite content hashes
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|eot|png|svg|ico|webp|jpg|jpeg)$/)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }
});

// ── Strategy helpers ──────────────────────────────────────────────────────────

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Network error', { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(APP_SHELL_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// ── Background Sync ───────────────────────────────────────────────────────────
// Handles queued voice memo ingest payloads that were captured offline.
// The app stores pending payloads in IndexedDB under 'voice-memo-sync'.

self.addEventListener('sync', (event) => {
  if (event.tag === 'voice-memo-sync') {
    event.waitUntil(flushVoiceMemoQueue());
  }
});

async function flushVoiceMemoQueue() {
  // Open the IndexedDB store where the app writes offline voice memo payloads
  const db = await openDB('atrium-offline', 1, 'voice-memos');
  const pending = await getAllFromStore(db, 'voice-memos');

  for (const record of pending) {
    try {
      const response = await fetch('/api/voice/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record.payload),
      });
      if (response.ok) {
        await deleteFromStore(db, 'voice-memos', record.id);
      }
    } catch {
      // Network still unavailable — leave in queue, sync will retry
    }
  }
}

// Minimal IndexedDB helpers (no library dependency in SW)

function openDB(name, version, storeName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function deleteFromStore(db, storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
