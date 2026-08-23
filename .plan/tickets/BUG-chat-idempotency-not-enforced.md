<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: idempotency_key column exists but no unique index — retried requests double-insert

**Status:** Not Started
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
