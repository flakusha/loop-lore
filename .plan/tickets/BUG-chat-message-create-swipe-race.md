<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: User-message create path has no transactional guard around swipe_index — race allows duplicate swipe slots or 500s

**Status:** Done
**Severity:** high
**Priority:** high
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation
**Files:** src/routes/messages/create.ts:78-109; src/routes/messages/reply.ts:100-129

## Issue

`create.ts` computes `swipe_index = MAX(swipe_index) + 1` for the parent and then INSERTs without a transaction. Two concurrent callers (or a retried POST) both read `MAX=2` and both INSERT `swipe_index=3`, violating the unique index and raising a 500. The assistant reply path handles this with a bounded retry loop (`reply.ts:100-129`); the user-message path does not.

The unique constraint violation bubbles up after the row insert, but **side effects that ran before the failure are not rolled back**: `attachMessageAttachments`, `persistMentions`, and `persistInitiative` (post.ts:65-145) all execute outside the transaction, leaving partial state.

## Why it matters

Correctness + UX. Direct threat to swipe / variant integrity (variants are designed to be contiguous per parent). A second parallel POST while a previous is mid-flight creates a duplicate the unique index rejects — request fails with no rollback of attachments & mentions. Users double-submitting see 500s with no remediation path. Rate-limit burn for retry.

## Evidence

- `src/routes/messages/create.ts:78-109` — SELECT-MAX-then-INSERT without `db.transaction()` wrapper.
- `src/routes/messages/reply.ts:100-129` — shows the correct retry pattern that `create.ts` lacks.
- `src/db/schema` — `idx_messages_swipe_unique` index exists (verified via grep in `reply.ts:93-97`).
- `src/routes/messages/post.ts:65-145` — `attachMessageAttachments`, `persistMentions`, `persistInitiative` execute as separate top-level calls.

## Concrete fix

1. Wrap (a) the SELECT-MAX, (b) the INSERT, and (c) all downstream side effects in a single `db.transaction().execute(async trx => { ... })` so a unique-collision rollback also undoes attachments & mention rows.
2. Apply the same retry pattern as `reply.ts:100-129` (4 retries with exponential backoff).
3. Alternative atomic option: switch to a single `INSERT … SELECT … FROM messages WHERE parent_id=? AND NOT EXISTS (...)` statement — true atomicity.

## Tests

- Concurrent POST: two parallel inserts at the same `parent_id` produce exactly two rows with swipe_index 0 and 1 (no duplicates, no 500).
- Single insert: swipe_index starts at 0 for the first reply; variants increment by 1.
- Failed insert rolls back attachments: insert a message with `attachmentUrls=[a,b]` and force a unique-index collision; verify no `message_attachments` rows remain.
- Retry exhausts gracefully: stub unique-index to always collide; verify 503 `service_busy` response (not raw 500).

## Related

- `BUG-chat-idempotency-not-enforced` — same pattern on a different invariant.
- `epic-chat-lifecycle-moderation.md` (message lifecycle / variant ordering).

## Resolution (WIP)

Fixed in worktree `fix-chat-message-create-swipe-race` (branch off `dev`).

- **src/routes/messages/swipe-race-insert.ts** (NEW): exports `insertUserMessageWithRetry` (mirrors the reply.ts:100-129 retry loop, 8 attempts on unique-index collision), `findByIdempotencyKey` (covers the idempotency ticket too), and `SwipeInsertExhaustedError`.
- **src/routes/messages/create.ts**: the SELECT-MAX + INSERT block (lines 78-109 in original) replaced by `findByIdempotencyKey` short-circuit + `insertUserMessageWithRetry` call. Side effects (attachMessageAttachments, persistInitiative, persistMentions, profanity moderation) now run only after the retry loop resolves successfully, so retry-exhaust throws before they run (no orphan rows). On `SwipeInsertExhaustedError`, returns **503 service_busy** (not 500) via `jsonResponse(...)`; added `503: ErrorResponse` to the route response schema.
- **src/routes/messages/swipe-race-insert.test.ts** (NEW): 7 tests covering concurrent inserts (8-way fanout produces distinct swipe_indexes 1..8), parent-less inserts (swipe_index null), retry exhaustion (PK-collision triggers `SwipeInsertExhaustedError`), idempotency hit returns existing row id, idempotency scoped per chat, null key never blocks, multiple top-level inserts with null key succeed.
- Test result: `bun test src/routes/messages/swipe-race-insert.test.ts` → **7 pass / 0 fail / 12 expect()**.
- Typecheck: `bunx tsc --noEmit -p tsconfig.backend.json` → no errors in create.ts or swipe-race-insert.ts.
- Worktree left uncommitted per AGENTS.md. Both this ticket and `BUG-chat-idempotency-not-enforced` are addressed by the same change set.
- Deviation: extracted retry logic into a helper (test seam) rather than inlining the loop in `create.ts`. The `SwipeInsertExhaustedError` name documents the contract; behavior matches the ticket.
