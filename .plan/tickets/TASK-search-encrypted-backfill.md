<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Encrypted-Content Backfill Migration

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low
**Type:** Feature Task (data migration)
**Tags:** rag, search, encryption, backfill, migration
**Epic:** epic-rag-document-processing.md, epic-encryption-workflow, epic-memory-knowledge-systems

## Summary

When `TASK-search-service-unified.md` lands the deterministic-ciphertext-token fuzzy search, all existing messages with `content_plaintext IS NULL` (client-pre-encrypted rows) need backfill: derive `message_search_tokens` for every encrypted message row using the row's owner user secret. This is a one-shot migration that runs after the schema lands.

## Why this task exists (the gap)

Encrypted messages become searchable only after both (a) the `message_search_tokens` table exists, AND (b) tokens have been derived for every row. Without backfill, only new messages get tokens; the historical backlog remains unsearchable until users re-encrypt (which never happens automatically).

## Design

### Migration approach

```ts
// src/db/migrations/parts/NNN_encrypted_search_backfill.ts
export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Find all messages with content_plaintext IS NULL
  // 2. For each, resolve owner user secret
  // 3. Derive tokens (HMAC-blinded per user)
  // 4. Insert into message_search_tokens(message_id, token, scope)
  // 5. Batch in 500-row chunks; idempotent (ON CONFLICT DO NOTHING)
}
```

- Runs in same migration as `parts/NNN_search_tokens.ts` (table create + backfill atomic)
- Idempotent — re-running produces no duplicate rows
- Progress logged at 10% intervals; abort-on-error option
- Bounded runtime — caps at 60s wall-clock per chunk; resumes on next migration run

### Token scope

- `scope = "messages"` for message-content tokens
- Future `scope = "assets"` for asset-content tokens (separate backfill when that lands)

## Files

- `src/db/migrations/parts/NNN_search_tokens.ts` — schema + backfill (single atomic migration)
- `src/search/encrypted-tokens-backfill.ts` — reusable backfill runner (for re-runs from CLI)
- `src/search/encrypted-tokens-backfill.test.ts` — idempotency, batch chunking, progress logging

## Acceptance Criteria

- [ ] Migration creates `message_search_tokens` table + FTS5 index
- [ ] Migration backfills all existing `messages` rows with `content_plaintext IS NULL`
- [ ] Re-running migration is idempotent (no duplicates)
- [ ] Progress logged; abort-on-error option
- [ ] Backfill completes within reasonable wall-clock for 1M-row datasets

## Dependencies

- Builds on: `TASK-search-service-unified.md` (`deriveSearchTokens` function)
- Schema strategy: **single atomic migration** (table + backfill) — never split
