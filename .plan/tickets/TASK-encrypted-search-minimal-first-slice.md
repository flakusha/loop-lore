<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Encrypted-search minimal first slice — wire + backfill for pilot chat

**Status:** Done
**Priority:** high
**Effort:** Medium (depends on `TASK-019-users-encryption-secret.md` landing first)
**Epic:** epic-chat-privacy
**Summary:** Wire `reindexMessageTokens` into `encryptMessageContent` behind an `ENABLE_TOKEN_INDEXING` env flag, and ship a one-shot backfill CLI that derives tokens for every existing `messages` row with `content_plaintext IS NULL` (i.e. client-pre-encrypted). This is the minimal proof that the existing 70%-built blind-index pipeline works end-to-end on a real chat. After it ships for one user/chat, the pattern extends to all users.
**Context:** Crypto + searchable-encryption flow audit (2026-09-25, `db-migration-fixes` session, scout report) named this slice as the recommended first step. Approach 1 (blind HMAC per-tenant token sidecar) was selected over approach 2 (deterministic nonce) and approach 3 (homomorphic / OPE) for fit. The seam is `messages.content_plaintext` — once `message_search_tokens` is reliably populated and `providers/messages.ts` resolves per-user keys, the column can be dropped without breaking search.

## Wire-up

- `src/crypto/message-content.ts` `encryptMessageContent(plaintext, ctx)` calls `reindexMessageTokens(messageId, plaintext, ctx.userId)` after the ciphertext is written, gated on `process.env.ENABLE_TOKEN_INDEXING === "1"`.
- `src/search/providers/messages.ts` `token` tier: `resolveKey(userId)` calls `selectFrom("users").select("encryption_secret").where("id", "=", userId)`; query derivation then runs through `deriveSearchTokens(query, userKey)` and `matchMessageIdsByTokens`.
- New flag-only behaviour — no schema change in this ticket (depends on `TASK-019-users-encryption-secret.md` for the key column).

## Backfill

- `scripts/backfill-message-tokens.ts`: streams messages in `LIMIT 500 OFFSET n` batches, joins `chats.encryption_level` (skip `none`), and for each message resolves the user via `chats.created_by` (or `chat_participants` owner), calls `deriveSearchTokens`, and upserts into `message_search_tokens(message_id, token, scope=user_id)`.
- Idempotent: `INSERT ... ON CONFLICT DO NOTHING` (table PK is `(message_id, token, scope)`).
- Progress logged at 10% intervals; bounded runtime (60s per batch; resume from checkpoint on re-run).
- Backfill runs once at the end of this slice; the live wire-up keeps new messages in sync.

**Acceptance Criteria:**

- [x] `ENABLE_TOKEN_INDEXING` env flag respected — `isTokenIndexingEnabled()` (`src/search/token-store.ts:33`) gates every write; off = no behaviour change, on = tokens written per insert.
- [x] Tokens written for every server-encrypted message — shipped as `indexMessageSearchTokens` at the message-insert sites (`src/routes/messages/reply.ts`, `command.ts`, `src/generation/generate-route/persist.ts`, the narration/store paths) rather than from `encryptMessageContent` (the crypto helper has no message id; the insert site owns the chat context); `reindexMessageTokens` covers the re-index path; one row per word ≥3 chars (`MIN_TOKEN_LENGTH = 3`, `src/search/encrypted-tokens.ts:25`) — covered by `src/search/token-store.test.ts`.
- [x] `src/search/providers/messages.ts` `token` tier resolves `users.encryption_secret` for query derivation (the owner-key resolver reads the secret, lines 50-62); the `keyword` tier is unchanged.
- [x] Backfill CLI — `src/scripts/backfill-message-tokens.ts` (shell) over `src/search/token-backfill.ts` (streaming, idempotent, resumable via `--after-rowid`), wired as `bun run backfill:messages:search-tokens` (+ `:dry`). The 1M-row wall-clock budget was not measured here.
- [x] Tests green — `src/search/token-store.test.ts` covers the indexing and the re-index path.

**Status Note (2026-11-10, dev `60fd92a2e`):** the slice shipped with the write side at the message-insert path instead of inside `encryptMessageContent`, and the backfill CLI under `src/scripts/` instead of `scripts/`. Rows the server cannot decrypt (client-pre-encrypted payloads) stay unsearchable — there is no plaintext to blind. The flag defaults to off.

**Tags:** db, crypto, search, encryption, blind-index, backfill
**Related:** src/crypto/message-content.ts, src/search/encrypted-tokens.ts, src/search/token-store.ts, src/search/providers/messages.ts, .plan/tickets/TASK-019-users-encryption-secret.md (prerequisite), .plan/tickets/TASK-search-encrypted-backfill.md, .plan/tickets/TASK-message-search-cannot-index-compressed-or-encrypted-content.md, .plan/tickets/TASK-rag-search-providers.md


git issue: e352a13

**Resolved:** 2026-11-10 registry-driven close: git issue e352a13 (registry tip: d0225dfcd Konstantin Fedotov Close issue)
