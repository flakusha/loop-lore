<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: `users.encryption_secret` — per-user HMAC key for token-indexed search

**Status:** Done
**Priority:** high
**Effort:** Small (one migration + key generation in user-create flow)
**Summary:** Add `users.encryption_secret TEXT` (32-byte hex) so the existing `deriveSearchTokens(plaintext, userKey)` primitive (HMAC-SHA256, 16-hex truncated) has a real per-user key. Currently the token-indexing column `message_search_tokens` exists but has no key source, so the feature is dead code. The column holds a per-user secret independent from `users.password_hash` and from chat keys.
**Context:** Crypto + searchable-encryption flow audit (2026-09-25, `db-migration-fixes` session, scout report) found that 70% of the encrypted-search plumbing is already in place: `src/search/encrypted-tokens.ts` exports `deriveSearchTokens`, `tokenizeForSearch`; `src/search/token-store.ts` exports `reindexMessageTokens`, `matchMessageIdsByTokens`; `message_search_tokens(message_id, token, scope)` exists. The missing piece is the per-user HMAC key — without it, the provider tier `token` in `src/search/providers/messages.ts` cannot resolve `key` for query derivation. The key is server-side (this is HMAC-blind-index, not client-side E2E); per-user key isolation gives us "token equality leaks across messages of the same user only" — the explicit tradeoff accepted 2026-09-07.

## Schema

```sql
ALTER TABLE users ADD COLUMN encryption_secret TEXT NOT NULL DEFAULT '';
```

For new users, generate `randomBytes(32).toString('hex')` during user-create (`src/auth/signup.ts`) and persist. Existing users get a backfill via a one-shot data migration that derives a key from the user's existing auth secret (the `users.password_hash` is unsuitable; better to force a one-time rotation via the admin script).

**Acceptance Criteria:**

- [ ] New migration file `src/db/migrations/019_users_encryption_secret.ts` exporting `up(db)` and `down(db)`.
- [ ] `up()` adds the column with `NOT NULL DEFAULT ''`. Down drops it.
- [ ] `src/auth/signup.ts` generates a 32-byte hex secret for new users.
- [ ] `src/scripts/backfill-users-encryption-secret.ts` (or in the same migration) back-fills existing users with a fresh random key.
- [ ] `src/search/providers/messages.ts` `token` tier resolves the per-user secret via `users.encryption_secret` (currently `resolveKey` is a stub).
- [ ] `bun run db:sync-types && bun run db:sync-manifest && bun run schemas:check` green.
- [ ] `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts src/crypto/` green.
- [ ] `bun run check` green.

**Tags:** db, crypto, search, encryption, blind-index
**Related:** src/crypto/pipeline.ts, src/search/encrypted-tokens.ts, src/search/token-store.ts, src/search/providers/messages.ts, .plan/tickets/TASK-search-encrypted-backfill.md, .plan/tickets/TASK-encrypted-search-minimal-first-slice.md, .plan/tickets/TASK-rag-search-providers.md


git issue: d14e674

**Resolved:** 2026-10-06 registry-driven close: git issue d14e674 (registry tip: 3be617c0b Konstantin Fedotov Auto-closed: appended .md marker marks TASK-019-USERS-ENCRYPTION-SECRET)
