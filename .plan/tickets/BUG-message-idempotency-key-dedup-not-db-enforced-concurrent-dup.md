<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Message idempotency-key dedup not DB-enforced - concurrent duplicate messages

**Status:** In Progress
**Implementation:** fix-message-idempotency-db-enforced (gates green; plan:sync/plan:validate advisory-only drift is pre-existing from concurrent sessions, identical findings on base)
**Priority:** high
**Effort:** Medium

**Summary:**

idx_messages_idempotency is NON-unique (src/db/migrations/001_init.ts:2151-2154) and create.ts dedups via check-then-insert (src/routes/messages/create.ts:131-163): two concurrent POSTs with one idempotencyKey both pass the check and BOTH insert - duplicate user messages (probe-demonstrated during review: 2 rows, same key). The swipe-slot unique index doesn't help; the retry path bumps swipe_index so both rows land. Fix: UNIQUE partial index on (chat_id, idempotency_key) WHERE idempotency_key IS NOT NULL; map the violation to lookup-and-return (swipe-race-insert catch pattern).

**Context:**

Fix follows the ticket's own prescription, with one scope refinement discovered while auditing every `messages.idempotency_key` writer: the key column also carries two families that legitimately REPEAT within one chat —

- `regen:variant:*` (chat/service/write.ts): pending variant rows reuse the key per (parent, style); the confirmed variant keeps the key for replay, so a later same-style regen re-inserts the key.
- `turn_skip:*` (chat/service/crud/turn-skip.ts): minute-bucket dedup keys collide across buckets; dedup there is the latest-message guard.

A blanket unique index would 500 both flows, so the index's WHERE clause excludes those prefixes. All other writers insert NULL keys (never constrained) or route through the replay-capable helper.

**Acceptance Criteria:**

- [x] Implementation complete — migration `040_messages_idempotency_unique` adds `uq_messages_idempotency_enforced` UNIQUE partial index on (chat_id, idempotency_key) with defensive dedupe of pre-existing duplicates; `isIdempotencyUniqueViolation` classifies the violation; `insertUserMessageWithRetry` maps race loss to the winner's row id (`replayedId`); `insertUserMessageRow` propagates it; `create.ts` short-circuits with the replayed id before any side effect and coerces empty-string keys to null; `db:sync-types`/`db:sync-manifest` regenerated (no output change — index-only migration).
- [x] Tests passing — `swipe-race-insert.test.ts` gains a DB-enforced dedup describe block: replay contract (winner id returned, single row), classifier forms (composite text + code form; negative for swipe/PK/FK), and both key-family exemptions.
- [x] Documentation updated — nothing to update: behavior now matches the documented idempotency contract.

## Review 2026-10-04

OPEN on dev - src/db/migrations/001_init.ts:2151-2154 idx_messages_idempotency is still a plain (non-unique) index and no later migration adds a UNIQUE partial index; src/routes/messages/create.ts:136-143 still check-then-insert via findByIdempotencyKey. No worktree migrations relevant.

## Fix 2026-10-05

Implemented on `fix-message-idempotency-db-enforced`. Commits: migration 040 (`bda8d8f0`), race-loss replay (`f33791be`), outcome propagation (`6635e294`), route short-circuit (`a6da2102`), empty-key coercion (`c3db9d68`), tests (`78bea44a`). Replay behavior proven against a migrated test DB: second same-key insert returns the winner's id and leaves exactly one row. Note: bun:sqlite reports the composite violation as `UNIQUE constraint failed: messages.chat_id, messages.idempotency_key` (each column table-prefixed) — the classifier keys on `messages.idempotency_key` appearing after the failure prefix plus the `SQLITE_CONSTRAINT_UNIQUE: uq_messages_idempotency_enforced` code form.
