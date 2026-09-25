<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: DB: add created_at/updated_at/metadata to infra and admin tables

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Summary:**
Add the repo's standard audit/extensibility columns to infra/admin tables that lack them. Exact gaps:

- `assets` → missing `updated_at` + `metadata` (alt_text, visibility, alpha_status, encryption_tier mutate; `data_version`/`record_hash` present)
- `users` → missing `updated_at` (role, status, settings, last_seen mutate)
- `notifications` → missing `updated_at` (read flag mutates; `data` column exists but no generic stamp)
- `request_results` → missing `updated_at` (status, progress, offload fields mutate; `started_at` covers creation; row has `data_version`/`record_hash`)
- `asset_transforms` → missing `created_at` (has `updated_at`; derived transform cache row)
- `admin_character_overrides` → missing `updated_at` (overrides, reason, expiry edited in place)
- `model_comparison_runs` → missing `updated_at` (ratings recorded after run; already has `metadata`)

**Context:**
Convention audit: `001_init.ts` defines `created_at text not null default (datetime('now'))` and several infra tables already carry both stamps plus extensibility (`system_config`, `plugin_state`, `user_api_keys` have `created_at`+`updated_at`; `seed_audit` has `metadata`). The gaps: `assets` and `users` — the two most-mutated admin-surface entities — have only `created_at`, and the offload/transform/comparison side tables track state changes without any update stamp.

**Column definitions:**
- `created_at text` — new-table convention `notNull default (datetime('now'))`; here added via ALTER as nullable (SQLite forbids non-constant DEFAULT in ADD COLUMN), backfilled, then always written by insert paths.
- `updated_at text` — nullable on add; maintained by writers on every UPDATE. NO SQLite trigger: 001_init triggers are integrity-only (locations path), no timestamp-maintenance trigger precedent exists.
- `metadata text` — nullable JSON object per row (assets only).

**Metadata compression + encryption (assets):**
`assets.metadata text` stores a JSON object. Compression + encryption support must reuse the existing asset pipeline: `src/crypto/asset-encryption.ts` `encryptAssetBlob()` / `decryptAssetBlob()` (chat-key based), and generally `src/crypto/pipeline.ts` `compressThenEncrypt()` / `decryptThenDecompress()` with the tier-aware wrapper `src/crypto/at-rest.ts`; compression patterns per `src/content/compress.ts` + the `ContentEncoding` enum. Reading encrypted asset metadata requires the correct credentials + decryption key (`assets.encrypted_key_id` / `encryption_tier` already select the key path); encrypted assets must not expose plaintext `metadata` — any sensitive per-asset extensions follow the same encryption tier.

**Migration policy:**
- Append-only: new migration `018_*` (latest is `017_asset_links_archived_at.ts`). Never edit 001–017.
- Backfill in `up()`: `UPDATE <t> SET updated_at = created_at WHERE updated_at IS NULL` where a `created_at` exists; `request_results SET updated_at = started_at`; `asset_transforms.created_at` has no source stamp — leave NULL for pre-existing rows rather than fabricating.
- Regenerate generated artifacts: `bun run db:sync-types && bun run db:sync-manifest`; `bun run schemas:check` green.

**Acceptance Criteria:**
- One `018_*` migration adds exactly the columns listed above to exactly the tables listed above; no other schema changes.
- Backfill UPDATEs present in `up()` as specified; no fabricated timestamps.
- Writers of affected tables set `updated_at` on mutation.
- `bun run db:sync-types && bun run db:sync-manifest` run; `schemas:check` green.
- `assets.metadata` respects the asset encryption tier when populated.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
