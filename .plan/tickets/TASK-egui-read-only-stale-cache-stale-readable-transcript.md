<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui read-only stale cache (stale-readable transcript)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-experimental-egui-frontend
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-experimental-egui-frontend (parity roadmap row 6 / host-page slice). Graduation follow-up: epic-desktop-app offline support (local DB sync) as SQLite plus outbox.

Slice: egui read-only stale cache. Writes stay explicitly disabled. No new crates.

On each successful parse_chats_page / parse_messages_page, persist raw JSON (or parsed rows) under versioned loop-lore.egui-cache.v1:chat_id (localStorage first, IndexedDB later). On fetch Err, render cached rows with offline-showing-cached status instead of empty lists. send() on network-error rejection keeps composer text and shows offline-send-unavailable (change from clear-then-fail). Pure-Rust cache module in the existing pure/host-tested style (GalleryState, StreamState).

Anchors: native/loop-lore-egui/src/app.rs:138-145 native/loop-lore-egui/src/app.rs:251-286 native/loop-lore-egui/src/storage.rs:13-28 native/loop-lore-egui/src/client.rs:9-16
Refs: https://docs.rs/eframe/latest/eframe https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation

Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Acceptance:

- Airplane-mode /egui with warm cache renders last-known list plus transcript with stale banner, no panic/empty-screen.
- Cold cache keeps current exact chat-list-failed behavior.
- Offline send preserves composer text and names the limitation.
- Cache schema versioned, mismatch discards (same rule as context.rs).
- cargo test -p loop-lore-egui green (cache round-trip plus stale-render plus version-mismatch-discard).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
