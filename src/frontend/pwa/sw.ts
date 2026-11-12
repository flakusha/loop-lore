// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * loop-lore service worker (1.0.0 THEME 4, TASK-pwa-cached-shell slice 1).
 *
 * Cache-first ONLY for the public static shell allowlist; network-first with a
 * timeout-then-offline-page for /views HTML (never cached — responses are
 * authenticated); /api and every other surface pass through untouched with
 * zero caching. Versioned purge on activate (old `loop-lore-shell-*` caches
 * deleted), skipWaiting + clients.claim so an updated shell takes over
 * immediately.
 *
 * Built unhashed to dist/public/sw.js by scripts/build-frontend.mjs — the
 * registration URL must be stable; content versioning lives in
 * SW_CACHE_VERSION (bump it when the precache list or shell semantics change).
 */
import { OUTBOX_DRAIN_MESSAGE, } from "./outbox-store";
import {
  CACHE_NAME_PREFIX,
  cacheName,
  classifyRequest,
  isShellAssetPath,
  PRECACHE_URLS,
  strategyFor,
  VIEW_NETWORK_TIMEOUT_MS,
} from "./sw-strategy";

// ── Minimal SW-scope typing (frontend tsconfig ships DOM lib only) ──
interface ExtendableEventLike extends Event {
  waitUntil(promise: Promise<unknown>,): void;
}
interface FetchEventLike extends Event {
  request: Request;
  respondWith(response: Promise<Response> | Response,): void;
}
interface ServiceWorkerLike {
  location: { origin: string };
  skipWaiting(): Promise<void>;
  clients: {
    claim(): Promise<void>;
    matchAll(options?: { type?: string },): Promise<Array<{ postMessage(message: unknown,): void }>>;
  };
  addEventListener(type: "install", listener: (event: ExtendableEventLike,) => void,): void;
  addEventListener(type: "activate", listener: (event: ExtendableEventLike,) => void,): void;
  addEventListener(type: "fetch", listener: (event: FetchEventLike,) => void,): void;
}

const sw = self as unknown as ServiceWorkerLike;

/** Precache the static shell; a single failing entry never blocks install. */
async function precacheShell(): Promise<void> {
  const cache = await caches.open(cacheName(),);
  await Promise.allSettled(PRECACHE_URLS.map(async (entry,) => {
    try {
      // cache:"reload" bypasses the HTTP cache so the shell stores fresh bytes.
      // eslint-disable-next-line no-restricted-syntax -- Cache.put needs the raw Response; safeFetch cannot round-trip binary shell assets.
      const response = await fetch(new Request(entry, { cache: "reload", },),);
      if (response.ok) { await cache.put(entry, response,); }
    } catch {
      // Non-critical: a missing entry is fetched on demand by the cache-first path.
    }
  },),);

  await sw.skipWaiting();
}

/** Purge every cache from an older shell version, then take over open clients. */
async function activateShell(): Promise<void> {
  const names = await caches.keys();
  await Promise.allSettled(
    names
      .filter((name,) => name.startsWith(CACHE_NAME_PREFIX,) && name !== cacheName())
      .map((name,) => caches.delete(name,)),
  );

  await sw.clients.claim();
}

/** Cache-first shell asset: cached copy wins; misses fetch and fill the cache. */
async function cacheFirst(request: Request, pathname: string,): Promise<Response> {
  const cache = await caches.open(cacheName(),);
  const cached = await cache.match(request,);
  if (cached) { return cached; }

  // eslint-disable-next-line no-restricted-syntax -- Cache.put needs the raw Response (binary assets); safeFetch cannot supply one.
  const response = await fetch(request,);
  if (response.ok && isShellAssetPath(pathname,)) {
    await cache.put(request, response.clone(),);
  }

  return response;
}

/**
 * Network-first for /views HTML: race the network against VIEW_NETWORK_TIMEOUT_MS;
 * on failure or timeout serve the cached public /offline.html page. The view
 * response itself is NEVER written to the cache (authenticated content).
 *
 * Connectivity ping (slices 2-3): a successful network fetch shortly after a
 * fallback means the connection is back — nudge every open client to drain
 * the offline send outbox (the page may have missed its `online` event).
 */
const CONNECTIVITY_SIGNAL_WINDOW_MS = 60_000;
let lastOfflineFallbackAt = 0;

/** Best-effort nudge; failures never surface (the page's `online` event also drains). */
async function notifyClientsToDrain(): Promise<void> {
  const clients = await sw.clients.matchAll({ type: "window", },);
  for (const client of clients) { client.postMessage({ type: OUTBOX_DRAIN_MESSAGE, },); }
}

async function networkFirstOfflinePage(request: Request,): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VIEW_NETWORK_TIMEOUT_MS,);
  try {
    // eslint-disable-next-line no-restricted-syntax -- respondWith streams the live Response; safeFetch buffers and cannot replay it.
    const response = await fetch(request, { signal: controller.signal, },);
    if (
      response.ok && lastOfflineFallbackAt !== 0 &&
      Date.now() - lastOfflineFallbackAt < CONNECTIVITY_SIGNAL_WINDOW_MS
    ) {
      lastOfflineFallbackAt = 0;
      void notifyClientsToDrain().catch(() => {
        /* best-effort: the page's own online event drains too */
      },);
    }

    return response;
  } catch {
    lastOfflineFallbackAt = Date.now();
    const cache = await caches.open(cacheName(),);
    const offline = await cache.match("/offline.html",);
    return offline ?? new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain", },
    },);
  } finally {
    clearTimeout(timer,);
  }
}

sw.addEventListener("install", (event,) => {
  event.waitUntil(precacheShell(),);
},);

sw.addEventListener("activate", (event,) => {
  event.waitUntil(activateShell(),);
},);

sw.addEventListener("fetch", (event,) => {
  const url = new URL(event.request.url,);
  const requestClass = classifyRequest(url, event.request.method, event.request.mode, sw.location.origin,);
  const strategy = strategyFor(requestClass,);

  // network-only: default browser semantics — the SW never responds or caches.
  if (strategy === "network-only") { return; }

  if (strategy === "cache-first") {
    event.respondWith(cacheFirst(event.request, url.pathname,),);
    return;
  }

  event.respondWith(networkFirstOfflinePage(event.request,),);
},);
