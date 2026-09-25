<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: DB: add created_at/updated_at/metadata to actor and character domain tables

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Summary:**
Add the repo's standard audit/extensibility columns to actor/character-domain tables that lack them. Exact gaps:

- `actors` → missing `metadata`
- `characters` → missing `metadata`
- `personas` → missing `metadata`
- `actor_chat_buffers` → missing `created_at`, `updated_at` (counters/cooldowns mutate; `last_chat_at` is NOT a creation stamp)
- `actor_daily_plans` → missing `updated_at` (priority, summary mutate)
- `actor_planned_activities` → missing `updated_at` (completed mutates)
- `actor_locations` → missing `created_at` (current-location row; `entered_at` covers updates)
- `character_arc` → missing `created_at` (has `updated_at`)
- `actor_keys` → missing `updated_at` (status rotates; `user_api_keys` already carries `updated_at` — precedent)
- `actor_e2e_pubkeys` → missing `updated_at` (revoked_at lifecycle)

**Context:**
Convention audit: `001_init.ts` defines `created_at text not null default (datetime('now'))` and most character_* state tables already carry `created_at` + `updated_at` (e.g. `character_stats`, `character_licensing`). The gaps are concentrated in the core entity rows (`actors`, `characters`, `personas` — stamps but no `metadata`), the BDI/agency tables added in `011_actor_bdi_lite.ts` (no stamps at all), and key tables that only have `created_at`.

**Column definitions:**
- `created_at text` — new-table convention `notNull default (datetime('now'))`; here added via ALTER as nullable (SQLite forbids non-constant DEFAULT in ADD COLUMN), backfilled, then always written by insert paths.
- `updated_at text` — nullable on add; maintained by writers on every UPDATE. NO SQLite trigger: 001_init triggers are integrity-only (locations path) and 011_actor_bdi_lite explicitly chose app-layer enforcement; no timestamp-maintenance trigger precedent exists.
- `metadata text` — nullable JSON object per row.

**Metadata compression + encryption (actors, characters, personas):**
`metadata text` stores a JSON object. Compression + encryption support must reuse the existing pipeline: `src/crypto/pipeline.ts` `compressThenEncrypt()` / `decryptThenDecompress()`, tier-aware wrapper `src/crypto/at-rest.ts`, compression patterns per `src/content/compress.ts` + `ContentEncoding` enum. Access to encrypted metadata requires the correct credentials + decryption key (actor keys via `src/crypto/actor-keys.ts`, chat keys via `src/crypto/chat-keys.ts`); where a character/chat is E2E-encrypted, sensitive metadata must go through the same pipeline rather than plaintext.

**Migration policy:**
- Append-only: new migration `018_*` (latest is `017_asset_links_archived_at.ts`). Never edit 001–017.
- Backfill in `up()`: `UPDATE actor_chat_buffers SET created_at = last_chat_at WHERE created_at IS NULL AND last_chat_at IS NOT NULL`; `character_arc` / `actor_locations` have no source stamp — leave NULL for pre-existing rows rather than fabricating; `UPDATE <t> SET updated_at = created_at WHERE updated_at IS NULL` elsewhere.
- Regenerate generated artifacts: `bun run db:sync-types && bun run db:sync-manifest`; `bun run schemas:check` green.

**Acceptance Criteria:**
- One `018_*` migration adds exactly the columns listed above to exactly the tables listed above; no other schema changes.
- Backfill UPDATEs present in `up()` as specified; no fabricated timestamps.
- Writers of affected tables set `updated_at` on mutation.
- `bun run db:sync-types && bun run db:sync-manifest` run; `schemas:check` green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
