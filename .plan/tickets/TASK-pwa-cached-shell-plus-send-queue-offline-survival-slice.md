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
- [x] Offline send keeps the optimistic message marked queued (slice 2 — landed: `stores/connection-store.ts` + `stores/connection.ts` ($store.connection.offline, online/offline listeners), offline banner in `views/layout.html`, chat-send offline fast-path + offline-class failure enqueue into localStorage `ll-outbox-v1`, queued badge in `components/chat/message-list.html`; i18n keys in all 10 locales).
- [x] Reconnect drains FIFO with zero duplicates (slice 3 — landed: `pwa/outbox-store.ts` drain (single-flighted, FIFO, replay with the SAME idempotency key via `apiFetch` → `Idempotency-Key` header + body key, so the migration-045 intake short-circuit coalesces partial successes); triggers: `online` event, SW connectivity ping (`ll-drain-outbox`, posted by `pwa/sw.ts` after a failed-then-successful view fetch), boot with a non-empty queue, next successful send; delivered → `ll-outbox:delivered` event reloads thread + chat list).
- [x] Poison (409/4xx) surfaces toast and drops only that entry, order preserved (slice 3 — landed: 2xx removes + continues; 4xx drops ONLY that entry and continues; 5xx/non-offline throws count attempts and pause the round — at `OUTBOX_MAX_ATTEMPTS` (3) the entry is surfaced + dropped; offline-class throws never count toward poison and pause the round, entries can queue indefinitely while offline).
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

Slices 2–3 (offline send outbox) LANDED (2026-11-12, same worktree):
- `src/frontend/pwa/outbox-store.ts` — pure FIFO store over injected storage
  (production: localStorage `ll-outbox-v1`; `createOutbox({ storage, now })`,
  no browser globals in tests). Entries carry chatId + idempotencyKey + the
  exact serialized POST body + enqueuedAt + attempts. Drain policy: 2xx
  removes and continues; 4xx is POISON — surface + drop ONLY that entry,
  order preserved for the rest; 5xx (and non-offline throws) count attempts
  and pause the round, dropping at `OUTBOX_MAX_ATTEMPTS` (3); offline-class
  throws never count toward poison and pause the round. Single-flighted; an
  entry enqueued mid-round is never clobbered (re-read before every write).
  Offline classification (`isOfflineClassError`): `navigator.onLine ===
  false`, TypeError, or an error WITHOUT a `status` (fe-fetch attaches status
  only when HTTP answered); bare `Unauthorized` (401) is explicitly NOT
  offline. Tests: `outbox-store.test.ts` (FIFO order, same-key replay,
  offline pause, poison drop-only-that-entry, max attempts, single-flight,
  no-clobber, corrupt storage).
- `src/frontend/stores/connection-store.ts` + `stores/connection.ts` —
  `$store.connection.offline` (layout banner, `views/layout.html`, scoped
  style block beside the notification-bell precedent) + the live outbox and
  its replay transport (`apiFetch` POST of the ORIGINAL body with the SAME
  idempotency key — feFetch re-attaches the `Idempotency-Key` header; the
  send-intake idempotency short-circuit returns the original row as 201, so
  a partial success replays into delivery, never a duplicate). Drain
  triggers: `online` event, SW ping (`OUTBOX_DRAIN_MESSAGE` posted by
  `pwa/sw.ts` network-first when a view fetch succeeds within 60s of a
  fallback), boot with a non-empty queue, and the next successful send.
- `src/frontend/alpine/chat-send.ts` + `chat-send-offline.ts` — offline
  fast-path (skip the doomed POST, enqueue, keep the optimistic row with
  `status: "queued"`, info toast `toasts.messageQueued`), offline-class
  failure path in the catch (enqueue the exact `sentBody`), success path
  triggers a drain; the `ll-outbox:delivered` document event reloads the
  thread + chat list via the chatState bridge. Queued badge in
  `components/chat/message-list.html` (`chats.queuedOffline`).
- i18n: `banners.offline`, `chats.queuedOffline`, `toasts.messageQueued`,
  `toasts.outboxDelivered`, `toasts.outboxPoison`, `toasts.outboxMaxAttempts`
  added to all 10 locale files (byte-identical JSON round-trip injection).

The IndexedDB upgrade path is still not built, as the slice spec allows.
Deferred (not built): an explicit retry/backoff timer between connectivity
events (drain runs on the four triggers above), and outbox-depth surfacing
beyond the toasts (theme-4 observability caveat).

**Implementation note (2026-11-12, outbox depth badge — this worktree):**

Outbox depth badge LANDED (theme-4 observability caveat closed at the UI
level):
- `src/frontend/pwa/outbox-store.ts` — new `discard(id)` on the store
  (per-entry removal, `true` when removed); drain now re-checks membership
  before every send so a mid-round discard is never sent. `size-allow`
  bumped 280 → 300 for the two additions.
- `src/frontend/stores/connection.ts` — `OUTBOX_CHANGED_EVENT`
  (`ll-outbox:changed`) dispatched on enqueue and after every drain round;
  the same document-event bridge the delivered reload uses. `discard` lives
  on the store and is called by the badge component directly.
- `src/frontend/alpine/outbox-badge.ts` — `outboxBadge()` Alpine component:
  depth from `outbox.depth()`, pending-list rows (content snippet collapsed
  then ellipsized at 80 chars, enqueued time via `toDate().toLocaleString()`),
  per-entry discard behind `confirm(t("chats.outboxDiscardConfirm"))`;
  refreshes on the change event (registered in `alpine/index.ts`).
- `src/views/layout.html` — persistent `#outbox-badge` host outside
  `#app-root` (survives htmx view swaps), scoped style block beside the
  offline-banner precedent, 44px tap targets, hidden at depth 0.
  `data-testid`: `outbox-badge`, `outbox-badge-button`, `outbox-badge-count`,
  `outbox-list`, `outbox-discard`, `outbox-empty`.
- i18n: `chats.outboxBadgeTitle` ({count} placeholder), `chats.outboxEmpty`,
  `chats.outboxQueuedAt` ({time}), `chats.outboxDiscard`,
  `chats.outboxDiscardConfirm` added to ALL 10 locale files (byte-identical
  JSON round-trip injection verified before writing).
- Tests: `outbox-store.test.ts` (+discard: targeted removal order-preserved,
  unknown-id no-op, mid-drain discard not clobbered/sent);
  `outbox-badge.test.ts` (enqueue→count, drain→count + list close, discard
  confirm accept/cancel, empty-queue toggle no-op, `ll-outbox:changed`
  bridge, snippet collapse/ellipsize, and the i18n contract — every new key
  resolves in all 10 locales + `{count}` placeholder present).

**BROWSER-LEVEL FINDING (open, blocks the offline e2e flow):** with
`navigator.onLine === false`, an offline send in the real browser pushes the
optimistic row then rolls it back WITHOUT ever writing `ll-outbox-v1` (no
`queueOfflineSend` warn either). Two layered defects identified 2026-11-12:

1. FIXED — classifier seam (`isOfflineClassError`,
   `src/frontend/pwa/outbox-store.ts`): a transport failure CAN carry a
   numeric `status` (notably status 0 stamped onto the failed error by
   fe-fetch), and the old `typeof status !== "number"` check misclassified
   it as a server answer, so the catch-path enqueue never fired. Now:
   `status` 0 or out-of-range (<=0, >599) is offline-class; 401/`Unauthorized`
   and 2xx–5xx stay non-offline. Unit-covered (`status 0 and out-of-range
   statuses are transport failures`, plus 502 stays non-offline).

2. OPEN — offline FAST path (`isOffline()` gate in `chat-send.ts`):
   instrumented browser runs (with fix 1 in the served bundle, verified by
   hash) show the fast path IS taken (`isOffline()=true`) but the queue call
   returns `false` — `buildBody()` or the enqueue throws inside the catch,
   so the row rolls back before the catch path is ever reached. RESOLVED
   the observability half 2026-11-12: the local copy's silent
   `catch { return false; }` now warns `log.warn("offline enqueue failed",
   { chatId, tempId, error })` (contract unchanged — still returns false;
   no message content in the log). Root-cause candidates narrowed by unit
   pin: `jsonBody` over a plain-object body cannot throw, `browserUUIDv7`
   succeeds on `crypto.getRandomValues`, and production storage (real
   localStorage) is live — leaving `buildBody()` →
   `browserCompressThenEncrypt` → `browserEncryptContent` (dead key / empty
   plaintext) as the prime suspect; pinned by a new unit asserting a
   throwing `buildBody` returns `false` with no queue write
   (`chat-send.test.ts` — offline fast-path root cause). The REAL e2e
   failure cause is still unproven in-browser: the console transport prints
   message (+ error) only — meta rides the entry to other sinks — so the
   browser console will name the seam but not chatId/tempId/cause until
   the console-vs-meta gap is closed. The two browser tests stay
   `test.skip` with this diagnosis until the fast-path fix lands and the
   flow genuinely passes.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
