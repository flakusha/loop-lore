<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: FTS5 triggers index encrypted ciphertext — chat search is non-functional for at-rest encrypted chats

**Status:** Not Started
**Severity:** high
**Priority:** high
**Effort:** medium
**Type:** BUG
**Epic:** epic-chat-context-optimization
**Files:** src/db/migrations/034_message_search_fts.ts:35-58; src/db/migrations/054_chat_keys.ts:141-163; src/routes/message-search/index.ts:80-100

> **DB Migration Strategy**: Before implementation, decide: append new migration part vs. fold into existing part. This fix proposes a new `content_plaintext` column → append a new part (`parts/0xx_messages_content_plaintext.ts`) wired into `001_init.ts`; do not modify shipped `034_message_search_fts.ts`/`054_chat_keys.ts` in place. See `src/db/migrations/README.md` (append-only policy). After migration edits: `bun run db:sync-types && bun run db:sync-manifest && bun run schemas:check`.

## Issue

`messages_fts_ai` / `_au` triggers copy `new.content` verbatim into `messages_fts.content`. But `prepareContentStorage` in `src/routes/messages/post.ts:39-75` stores the **ciphertext + key_id** in `messages.content` for `standard`/`private` tier chats. The FTS5 index is therefore populated with base64 / AES bytes, not the plaintext the user typed. Migration 054 re-creates the same triggers unmodified, so the bug is preserved across the chat-keys drop+rebuild.

## Why it matters

Correctness / UX. The advertised full-text search feature (`TASK-chat-message-search.md`) is **non-functional for any user with encryption-at-rest enabled** — the default path on a fresh deploy. Searches return false negatives (real tokens never matched) or unrelated ciphertext-fragment matches. Users will see this as silently broken search.

## Evidence

- `src/db/migrations/034_message_search_fts.ts:35-58` — `CREATE TRIGGER messages_fts_ai AFTER INSERT ON messages BEGIN INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content); END`
- `src/routes/messages/post.ts:39-75` — `prepareContentStorage` writes `ciphertext` (JSON `{ ct: ..., keyId: ... }`) into `messages.content` when `getChatEncryptionLevel(chatId) !== 'none'`
- `src/routes/message-search/index.ts:80-100` — `MATCH` query against `messages_fts` runs over ciphertext
- Migration 054 re-installs triggers without modification

## Concrete fix

Prefer option 1.

1. Maintain a `content_plaintext` shadow column on `messages` populated by application code (post.ts + update.ts) and zeroed on key rotation. Point the FTS5 trigger at `content_plaintext` instead of `content`. Add migration `0xx_messages_content_plaintext.ts` to introduce the column + replace trigger body.
2. Alternative: drop the trigger, move FTS maintenance to the route layer (`post.ts:prepareContentStorage`, `update.ts:editMessage`), and explicitly DELETE + INSERT against `messages_fts` using plaintext.

Either path must:
- Re-tokenize on `PATCH /messages/:id` (the edit path).
- Re-tokenize when a swipe variant is created.
- Re-tokenize in `migrateChat` when messages copy to a new chat.
- Handle tier rotation (`none` ↔ `standard` ↔ `private`).

## Tests

- `bun test src/routes/message-search/` — encryption ON: search for a known plaintext token returns matching rows.
- `bun test src/routes/messages/update.ts` — edit encrypted message, search still finds the new content.
- Tier rotation: rotate `none` → `standard`, search still finds recent plaintext.
- `migrateChat` copies messages: search after migration finds tokens.

## Related

- `TASK-chat-message-search.md` — parent feature
- `epic-chat-context-optimization.md`
- Companion tickets: `BUG-chat-message-update-no-fts-refresh`, `BUG-chat-encryption-edit-key-drift`
