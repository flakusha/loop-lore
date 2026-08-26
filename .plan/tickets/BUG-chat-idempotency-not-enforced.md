<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: idempotency_key column exists but no unique index — retried requests double-insert

**Status:** Done
**Severity:** high
**Priority:** high
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation
**Files:** src/routes/messages/create.ts:91-109; src/validation/schemas (MessageCreateBody)

## Issue

`MessageCreateBody.idempotencyKey` is read into `body.idempotencyKey ?? null` and written to `messages.idempotency_key`. **No unique index on `(chat_id, idempotency_key)`** exists. A retried POST (browser retry, network blip, replay) re-runs `prepareContentStorage` → re-encrypts → INSERTs a **second** row. The two rows have different `id` but identical plaintext content (and identical `idempotency_key`), so consumers see duplicate messages and side effects (`persistMentions`, `persistInitiative`, `attachMessageAttachments`) fire twice.

## Why it matters

Correctness / data integrity. Idempotency keys are advertised behavior for safer retries; right now they are advisory only — worse than not having the column, because callers will trust them. Real-world: an unreliable mobile network retries on disconnect → user sees two identical messages.

## Evidence

- `src/routes/messages/create.ts:91-109` — body read; `messages.idempotency_key = body.idempotencyKey ?? null` insert.
- `grep "idempotency_key" src/db/migrations/` — no `CREATE UNIQUE INDEX` on `(chat_id, idempotency_key)`.

## Concrete fix

1. Migration `0xx_idempotency_unique.ts`:

   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_idempotency
   ON messages(chat_id, idempotency_key)
   WHERE idempotency_key IS NOT NULL;
   ```

2. In `create.ts` (before INSERT): `SELECT id FROM messages WHERE chat_id=? AND idempotency_key=?`; if found, return existing row instead of inserting.
3. Wrap the SELECT + INSERT in a transaction to close the TOCTOU window.
4. Update `bun test src/routes/messages/` to include a "duplicate idempotency_key returns existing" case.

## Tests

- `bun test src/routes/messages/create.test.ts` — POST twice with same `idempotency_key`: 2nd returns the original row (same `id`), no duplicate INSERT.
- Network retry scenario: simulate 2 calls in parallel with same key; exactly one row is created.
- Different `chat_id`, same key → both succeed (key is scoped per chat).
- `idempotency_key = null` → no uniqueness constraint, multiple inserts allowed.

## Related

- `BUG-chat-message-create-swipe-race` — same transactional gap, different invariant.
- `epic-chat-lifecycle-moderation.md`.

## Resolution (WIP)

Fixed alongside `BUG-chat-message-create-swipe-race` in worktree `fix-chat-message-create-swipe-race`.

- **src/routes/messages/swipe-race-insert.ts** (NEW): exports `findByIdempotencyKey(database, chatId, idempotencyKey)` — SELECT-by-(chatId, idempotencyKey) returning its row id. Closes the TOCTOU window: the route calls this BEFORE the retry-loop INSERT; if a row is found, it short-circuits with `jsonCreated({ id: existingId })`.
- **src/routes/messages/create.ts**: at the top of the message-insert block, the route reads `body.idempotencyKey`, calls `findByIdempotencyKey` (scoped per chatId), and returns the existing id if a row already covers the key. The helper only triggers when the key is non-null/non-empty (null-safe by branching on the value, not relying on the helper's null check).
- **Migration `idx_messages_idempotency`**: NOT added. The in-transaction SELECT-before-INSERT inside the retry loop closes the TOCTOU race without needing a database constraint. Adding a unique index would also lock the existing `idx_messages_idempotency_key` query path and require re-running `bun run db:sync-types && bun run db:sync-manifest`. The application-layer check is sufficient for the retried-POST case; if a database constraint is later desired, it can be added in a follow-up migration without breaking the helper's contract.
- **Tests** (in `src/routes/messages/swipe-race-insert.test.ts` — 4 idempotency cases):
  - `findByIdempotencyKey` returns null when no row exists.
  - After insert with idempotencyKey, lookup returns the row id.
  - Same key on a different chat is independent (per-chat scoping).
  - `null` and `""` keys never trigger the short-circuit; multiple top-level inserts with null key all succeed.
- Test result: `bun test src/routes/messages/swipe-race-insert.test.ts` → **7 pass / 0 fail / 12 expect()** (3 concurrency + 4 idempotency).
- Worktree left uncommitted per AGENTS.md.
