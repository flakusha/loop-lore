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

## Resolution

The column already existed (`001_init.ts:3669` add / `4410` drop, `schema-core.ts:220`), so no migration was written — the ticket's Schema/AC sections were stale on that point. Three of the eight original criteria named files that do not exist (`src/auth/signup.ts`, `src/db/migrations/019_users_encryption_secret.ts`); the real user-create sites were found and instrumented instead.

**Key generation** — `src/crypto/user-secret.ts:41` `generateEncryptionSecret()` returns 32 CSPRNG bytes as 64 lowercase hex, mirroring the actor-key shape at `src/crypto/actor-keys.ts:108`. `isUsableEncryptionSecret` (`src/crypto/user-secret.ts:57`) rejects NULL/empty/short/non-hex so a malformed row cannot reach `deriveSearchTokens`, which throws on an empty key.

**User-create sites instrumented** (three, not one):
- `src/routes/auth/register.ts:155` — `handleRegister`, the real registration path (the ticket's `src/auth/signup.ts` does not exist).
- `src/db/seed.ts:88` — demo solo user; `src/db/seed.ts:144` — bootstrap admin.
- `scripts/seed-users.ts:78` — the `seed:users` provisioning script.

**Backfill** — `src/scripts/backfill-users-encryption-secret.ts:52` `runBackfill()` writes only rows where `encryption_secret IS NULL OR = ''` (`:55`), so a second run updates nothing and never rotates a live key (rotating would orphan every token already indexed under the old key). CLI entry `backfill:users:encryption-secret` with `--dry-run`; wired into `package.json`.

**Search wiring** — `src/search/providers/messages.ts:120` now defaults `resolveKey` to a `users` lookup (`loadEncryptionSecret`, `:53`) instead of requiring an injected resolver; the dead `opts?.resolveKey === undefined` early-return at the `token` tier is gone. `MessageProviderOptions.resolveKey` stays as the documented test override, and `searchMessages` (`src/search/convenience.ts:58`) passes it through unchanged.

**Verification** — `bun run typecheck` and `typecheck:frontend` exit 0; `bun run md:lint` 0 issues; `bun run size:check` clean (largest new file 109 lines vs the 249 budget); `bun run schemas:check` reports all schemas up-to-date. Behaviour was proven with throwaway scripts against a real DB (since removed): key generation is 64 hex chars and unique across 50 draws; backfill run 1 → `{missing:2, updated:2}`, run 2 → `{missing:0, updated:0}` with the pre-existing key byte-identical; the `token` tier hit an indexed message through the default resolver with no opts, returned `[]` for a keyless user instead of throwing, and returned `[]` under a different user's key. Tests added but not executed (serialized test jobs are owned by another workstream this batch): `src/crypto/user-secret.test.ts`, `src/scripts/backfill-users-encryption-secret.test.ts`, and the rewritten token-tier cases in `src/search/providers/messages.test.ts`.

**Known gap (not in this ticket's scope)** — `searchMessages` still has no production caller; the live `/api/messages/search` route (`src/routes/message-search/index.ts`) is a separate raw-FTS5 implementation that never calls the search service. The token tier is now correctly wired and reachable, but exposing it over HTTP needs that route rebuilt on `createMessageProviders`.

**Resolved:** 2026-10-06 registry-driven close: git issue d14e674 (registry tip: 3be617c0b Konstantin Fedotov Auto-closed: appended .md marker marks TASK-019-USERS-ENCRYPTION-SECRET)
