<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: DELETE /messages/:id sets visibility=hidden but doesn't clear FTS row or wipe ciphertext — violates right-to-be-forgotten

**Status:** ✅ Resolved (verified 2026-09-07; bookkeeping)
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation
**Files:** src/routes/messages/update.ts:31-56; src/db/migrations/034_message_search_fts.ts; src/routes/messages/post.ts

> **DB Migration Strategy**: Before implementation, decide: append new migration part vs. fold into existing part. The hard-delete path manipulates existing `messages` columns and the `messages_fts` index (built by `034_message_search_fts.ts`); do not modify that shipped part in place — if a schema change is needed (e.g. an FTS trigger rebuild or purge-related column), append a new part wired into `001_init.ts`. See `src/db/migrations/README.md` (append-only policy). After migration edits: `bun run db:sync-types && bun run db:sync-manifest && bun run schemas:check`.

## Issue

The endpoint uses `DELETE` HTTP verb but only sets `visibility='hidden_by_user'`. Two consequences:

1. **FTS row survives.** `messages_fts_ad` trigger fires only on actual `DELETE` statements (not `UPDATE`). The updated row remains in the FTS5 index. A subsequent search for distinctive substrings still surfaces the "hidden" message.
2. **Content stays on disk.** The ciphertext / encrypted content remains in `messages.content`. For an encryption-at-rest chat with strict retention needs (GDPR right-to-be-forgotten, legal hold expiry), "delete" must be tombstone + content wipe + key invalidation, not visibility flip.

PATCH edit (update.ts:58-150) can still retrieve the row via DB-level query (visibility filter is route-layer only — direct DB queries see the row).

## Why it matters

Compliance / privacy. Right-to-be-forgotten flows rely on `DELETE` actually removing content. The FTS index becomes a parallel leak vector. A user who deleted a sensitive message because they regret sharing it is surprised to see it appear in search results.

## Evidence

- `src/routes/messages/update.ts:31-56` — DELETE handler sets `visibility='hidden_by_user'`.
- `src/db/migrations/034_message_search_fts.ts:42-50` — `messages_fts_ad` is `AFTER DELETE`; UPDATE doesn't fire it.
- `src/routes/messages/post.ts:39-75` — content stored encrypted with `key_id`; no clear path to wipe key + content.

## Concrete fix

1. Add a `?hard=true` query param to opt into hard-delete. Default remains soft-delete (preserves variant ordering / references).
2. In hard-delete mode:
   - Set `content = NULL`, `key_id = NULL`, `content_encoding = 'identity'`.
   - Explicitly `DELETE FROM messages_fts WHERE rowid = ?` (the trigger doesn't fire on UPDATE).
   - Cascade-update any referencing rows (`message_attachments`, `message_reactions`, `prompt_mentions`).
   - Record a `moderation_audit` row: "user X hard-deleted message Y at time Z".
3. Add an admin-only `/admin/messages/:id/purge` route that bypasses the visibility filter and purges even "hidden" rows after a 30-day grace period.
4. Documentation: state explicitly which mode is GDPR-compliant.

## Tests

- `bun test src/routes/messages/update.test.ts` — `DELETE /messages/:id?hard=true` removes from `messages_fts`, sets `content = NULL`.
- Search regression: hard-deleted message no longer surfaces in `GET /search?q=...`.
- Cascade: hard-delete a message with attachments → `message_attachments` rows also removed.

## Related

- `BUG-chat-fts-encrypt-mismatch` (FTS maintenance).
- `epic-chat-lifecycle-moderation.md` (visibility state machine).
- `epic-security-sandboxing.md` (retention policies).

## Resolution

Verified on dev HEAD (2026-09-07). The hard-delete branch of src/routes/messages/update.ts:54-76 issues a real `database.deleteFrom` which fires the `messages_fts_ad` trigger in parts/016_fts.ts:23-25. FK cascade on `message_attachments` removes dependent rows. Covered by fts-lifecycle.test.ts (`real DELETE from messages fires messages_fts_ad and removes the FTS row`). The soft (visibility=hidden) path is intentionally preserved for the user-revoke flow.
