<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: offline outbox sync engine (shared SQLite outbox plus conflict policy)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-desktop-app
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-desktop-app (graduation slice). Shared sync engine for both frontends. Prerequisites: TASK-pwa-cached-shell-plus-send-queue-offline-survival-slice (browser outbox pattern) and TASK-egui-read-only-stale-cache-stale-readable-transcript (egui cache seam).

Build the shared local-first sync engine both frontends converge on: SQLite (browser OPFS/SQLite-WASM plus native rusqlite, same schema) as source of truth, durable outbox table (envelope plus idempotency key plus backoff, same shape as mesh_outbox server pattern but client-owned), online drain with FIFO replay plus server-wins LWW reconcile, poison-quarantine with toast/status surfacing.

Anchors: src/db/migrations/038_mesh_outbox.ts:4-15 native/loop-lore-egui/src/storage.rs:13-28 src/frontend/alpine/chat-send.ts:154-166 native/loop-lore-egui/Cargo.toml:15-30
Refs: https://developer.chrome.com/docs/workbox/modules/workbox-background-sync https://amux.io/guides/pwa-offline-sync-outbox-pattern

Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Acceptance:

- Both frontends drain through the shared outbox contract (same envelope plus dedup-key plus backoff semantics).
- Airplane-mode writes queue durably (survive reload), reconnect drains FIFO with zero duplicates.
- Conflict policy documented and tested (server-wins LWW, poison quarantine preserves order).
- No new unvetted deps beyond sqlite-wasm/rusqlite equivalents already evaluated. bun run check plus cargo test green.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
