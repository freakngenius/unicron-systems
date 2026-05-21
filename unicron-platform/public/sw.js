// Atrium Service Worker
// Strategy:
//   - App shell (HTML/CSS/JS): cache-first with versioned cache key
//   - /api/* routes: network-first, no caching (freshness wins)
//   - Navigation requests: network-first with offline.html / index.html / inline fallback
//   - Background sync: 'atrium-ingest-replay' drains /api/ingest payloads
//     queued in IndexedDB. 'voice-memo-sync' retained for legacy voice flow.
//   - Never cache responses with `?` query params or `Cache-Control: no-store`.

// Cache key bumps:
//   - 2026-05-11: Pass 2 (8 streams) + logo replacement caused stale cache-first JS chunks to linger.
//   - 2026-05-21: Sprint 7 Task 1 — PWA wrapping refresh; align with prompt's atrium-shell-v1 family.
const CACHE_VERSION = 'atrium-shell-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const OFFLINE_URL = '/offline.html';
const INDEX_URL = '/index.html';

// Pre-cache the root HTML, offline page, and index.html so navigation
// fallback can serve either when the network is down. Vite hashes JS/CSS
// bundle filenames so those are cached dynamically on first fetch via the
// cache-first handler below.
const PRECACHE_URLS = ['/', OFFLINE_URL, INDEX_URL];

// Inline minimal offline fallback used only when neither offline.html nor
// index.html is in cache (e.g. very first launch with no network).
const INLINE_OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atrium is offline</title>
<style>
html,body{height:100%;margin:0;background:#0a0a0a;color:#e5e5e5;
font-family:Inter,system-ui,-apple-system,sans-serif}
body{display:flex;align-items:center;justify-content:center;padding:2rem}
.box{max-width:360px;text-align:center}
.tag{font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:#737373;margin-bottom:1.5rem}
h1{font-size:1rem;font-weight:500;margin:0 0 .5rem}
p{font-size:.875rem;color:#737373;line-height:1.6;margin:0}
</style></head><body><div class="box">
<div class="tag">Atrium</div>
<h1>Atrium is offline.</h1>
<p>You will reconnect when your network returns. Captured payloads will sync automatically.</p>
</div></body></html>`;

// Load companion queue helper for the 'atrium-ingest-replay' sync tag.
// Exposes self.flushIngestReplayQueue().
try {
  importScripts('/sw-ingest-queue.js');
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('[atrium-sw] failed to load sw-ingest-queue.js', err);
}

// ── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('atrium-') && key !== APP_SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

  // NETWORK-FIRST: /api/* — never cache dynamic data.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstNoCache(request));
    return;
  }

  // Navigation: network-first, fall back to offline.html / index.html / inline.
  if (request.mode === 'navigate') {
    event.respondWith(navigationWithOfflineFallback(request));
    return;
  }

  // CACHE-FIRST: static assets (JS, CSS, fonts, images) with Vite content hashes.
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|eot|png|svg|ico|webp|jpg|jpeg)$/) &&
    isCacheable(request, url)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }
});

// ── Strategy helpers ──────────────────────────────────────────────────────────

// Skip cache for query-param URLs and any response with Cache-Control: no-store.
function isCacheable(request, url) {
  if (url.search) return false;
  return true;
}

function isNoStoreResponse(response) {
  const cc = response.headers.get('Cache-Control') || '';
  return cc.toLowerCase().includes('no-store');
}

async function networkFirstNoCache(request) {
  try {
    return await fetch(request);
  } catch {
    // /api/* is never cached on success; only return cached if we somehow
    // have it (legacy entries), otherwise 503.
    const cached = await caches.match(request);
    return cached || new Response('Network error', { status: 503 });
  }
}

async function navigationWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cachedOffline = await caches.match(OFFLINE_URL);
    if (cachedOffline) return cachedOffline;
    const cachedIndex = await caches.match(INDEX_URL);
    if (cachedIndex) return cachedIndex;
    return new Response(INLINE_OFFLINE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && !isNoStoreResponse(response)) {
    const cache = await caches.open(APP_SHELL_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

// ── Background Sync ───────────────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  // New canonical tag — drains the /api/ingest replay queue.
  if (event.tag === 'atrium-ingest-replay') {
    if (typeof self.flushIngestReplayQueue === 'function') {
      event.waitUntil(self.flushIngestReplayQueue());
    }
    return;
  }

  // Legacy voice-memo queue (retained until producer code is migrated).
  if (event.tag === 'voice-memo-sync') {
    event.waitUntil(flushVoiceMemoQueue());
  }
});

async function flushVoiceMemoQueue() {
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
      // Network still unavailable — leave in queue, sync will retry.
    }
  }
}

// Minimal IndexedDB helpers (no library dependency in SW).

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
