<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: PWA cached shell plus send queue (offline survival slice)

**Status:** In Progress
**Priority:** high
**Effort:** Medium
**Epic:** epic-byok-local-models
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-byok-local-models (only live epic covering browser WASM plus IndexedDB plus offline tags. Proposed epic-offline-pwa never materialized, do not file under it).

Slice: cached PWA app-shell plus failed-mutation outbox with Idempotency-Key replay. No CRDT, no SQLite, no offline generation.

1. src/public/manifest.webmanifest plus sw.js (new): precache dist/public hashed bundles plus theme CSS plus default avatar. Runtime-cache GET /views/* (stale-while-revalidate) plus GET reads with cache-fallback. Versioned purge on build hash.
2. src/frontend/stores/connection.ts (new, online/offline listeners plus navigator.onLine): banner in layout header slot. Gate chat-send so offline keeps the tmp- row and enqueues idempotencyKey body chatId createdAt to localStorage ll-outbox-v1 (IndexedDB upgrade path noted, not built) instead of removeTempMessage rollback.
3. Drain: on online plus on boot, replay FIFO through existing apiFetch (keys already idempotent), then loadMessages/loadChats. Failures stay queued with backoff. 409/VN/4xx poison surfaces toast and drops only that entry.

Anchors: src/views/layout.html:63 src/frontend/alpine/chat-send.ts:154-166 src/frontend/fe-fetch.ts:45-128 scripts/build-frontend.mjs:29-73
Refs: https://htmx.org/essays/you-cant/ https://github.com/mvolkmann/htmx-offline

Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Acceptance:

- [x] Airplane-mode reload renders cached shell (slice 1: precache + cache-first shell; navigations fall back to the cached public `/offline.html` — note: NOT the last-visited view, because caching authenticated /views HTML is ruled out by the repo's security posture).
- [ ] Offline send keeps the optimistic message marked queued (slice 2 — open, not built).
- [ ] Reconnect drains FIFO with zero duplicates (slice 3 — open, not built).
- [ ] Poison (409/4xx) surfaces toast and drops only that entry, order preserved (slice 3 — open, not built).
- [x] No new deps — none added.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Implementation note (2026-11-12, worktree theme4-pwa-caps):**

Slice 1 (cached PWA app shell) LANDED:
- `src/public/manifest.webmanifest` — name/short_name, `start_url: /views/chat-list`, `scope: /`, `display: standalone`, theme+background `#151820`. Ships WITHOUT icons deliberately: the repo has no raster app icons (`src/public/img/icons/` holds UI glyphs; `favicon.svg` is the only brand mark), SVG-only installability is not dependable (open Chromium issue 40706719 re `sizes:"any"`), and fabricating PNG binaries was ruled out. Add real 192/512 PNG icons before relying on the install prompt.
- `src/public/offline.html` — self-contained CSP-safe fallback (no scripts, inline CSS only), served by the SW when a view fetch fails or times out.
- `src/frontend/pwa/sw-strategy.ts` — PURE route classification + strategy table (`classifyRequest` / `strategyFor` / `isShellAssetPath` / `PRECACHE_URLS` / `cacheName`), colocated tests in `sw-strategy.test.ts` (static→cache-first, `/views` + navigations→network-first, `/api`→network-only and NOT intercepted, non-GET / cross-origin / `/sw.js`→passthrough, precache-manifest hygiene: no `/api`, no `/views` entries).
- `src/frontend/pwa/sw.ts` — SW entry, built UNHASHED to `dist/public/sw.js` by `scripts/build-frontend.mjs` (stable registration URL). Install precaches the public shell allowlist (layout CSS, bare bundle names the server resolves to hashed siblings, favicon/manifest/offline page) tolerating per-entry failures; activate purges older `loop-lore-shell-*` caches (version constant `SW_CACHE_VERSION` in sw-strategy.ts — bump when the precache list or shell semantics change) and `clients.claim()`; install ends in `skipWaiting`. Fetch: cache-first ONLY for the shell allowlist plus runtime-cached `/css/` `/img/` `/locales/` `/components/` static extensions; `/views` and top-level navigations go network-first with a 5s timeout falling back to cached `/offline.html`, and the view response is NEVER written to Cache Storage (authenticated content); `/api` and everything else is NOT intercepted — zero caching by construction. Three targeted `no-restricted-syntax` disables on bare `fetch` carry reasons: Cache.put needs raw Responses (binary shell assets) and `respondWith` streams the live response — safeFetch cannot supply either.
- `src/frontend/pwa/register.ts` (imported by `alpine-init.ts`) — registers `/sw.js` on window load; failures log through the standard frontend logger. CSP already allows the worker script (`headers.workerSrc: ['self', 'blob:']`).
- `src/server/static-mime.ts` — `.webmanifest` → `application/manifest+json` (was text/plain, which breaks manifest parsing).
- `src/views/layout.html` — `<link rel="manifest">` + `<meta name="theme-color">` in the head.

Slices 2–3 (offline send outbox: `stores/connection.ts` banner, chat-send gating into `localStorage ll-outbox-v1`, FIFO drain with idempotency-key replay + poison handling) remain OPEN — no outbox code exists in this worktree. The IndexedDB upgrade path is still not built, as the slice spec allows.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
