<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: PWA cached shell plus send queue (offline survival slice)

**Status:** Not Started
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

- Airplane-mode reload renders cached shell plus last-visited view with banner (no blank app-root).
- Offline send keeps the optimistic message marked queued (not rolled back, nothing restored to composer).
- Reconnect drains FIFO with zero duplicates (server log shows one row per logical send).
- Poison (409/4xx) surfaces toast and drops only that entry, order preserved.
- No new deps. bun run check green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
