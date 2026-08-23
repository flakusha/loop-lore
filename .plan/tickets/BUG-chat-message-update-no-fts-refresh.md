<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: PATCH /messages/:id edit does not re-tokenize FTS — edited messages are searchable only against the original plaintext

**Status:** Not Started
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-context-optimization
**Files:** src/routes/messages/update.ts:106-135; src/db/migrations/034_message_search_fts.ts

## Issue

`PATCH /messages/:id` writes new `content` to `messages`. The migration-034 `messages_fts_au` trigger (`AFTER UPDATE OF content`) should re-tokenize, but the trigger operates on `messages.content`. When the chat is encrypted, `messages.content` holds **ciphertext**, so the FTS row is updated to the new ciphertext (consistent with the create path but still useless for search).

Worse: when an unencrypted chat moves to encrypted mid-edit (tier rotation), the FTS row carries plaintext from a previous tokenization but `messages.content` now carries ciphertext. Result: search returns hits for text the user no longer has (or the inverse — no hits for text that's still on disk).

## Why it matters

Correctness of search results vs. encrypted content, and stale FTS after tier rotation. Companion to `BUG-chat-fts-encrypt-mismatch`; fixing this ticket depends on whichever FTS-encryption approach is taken there.

## Evidence

- `src/routes/messages/update.ts:106-124` — `messages.content` updated; trigger fires on `UPDATE OF content`.
- `src/db/migrations/034_message_search_fts.ts:35-58` — trigger body copies `new.content` verbatim.

## Concrete fix

Tied to the parent FTS-encryption fix:

1. If going with `content_plaintext` shadow column: PATCH must write both `content` (encrypted) **and** `content_plaintext` (plaintext for FTS). Update the trigger to source from `content_plaintext`.
2. If going with explicit FTS maintenance in route layer: PATCH must explicitly DELETE + INSERT against `messages_fts` using the appropriate plaintext source (from the route's plaintext input, not from `messages.content`).
3. Either path: validate the FTS row after edit by querying `messages_fts WHERE rowid=?` and asserting it matches.

## Tests

- `bun test src/routes/messages/update.test.ts` — PATCH a message in an encrypted chat, then search for the new content token; expect a hit.
- Tier rotation scenario: chat moves `none → standard`, edit a message, verify FTS still finds the new tokenized plaintext.
- Bug regression: PATCH a message, edit AGAIN, search — verify both edits are searchable.

## Related

- `BUG-chat-fts-encrypt-mismatch` (parent).
- `epic-chat-context-optimization.md`.
