<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: DB: add created_at/updated_at/metadata to chat-domain tables

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Summary:**
Add the repo's standard audit/extensibility columns to chat-domain tables that lack them: `updated_at` where mutable rows have no update stamp, and `metadata` (JSON text) for the one core chat entity missing it. Exact gaps:

- `messages` → missing `updated_at` (has `created_at`, `edited_at`, but status/visibility/swipe/e2e fields mutate with no generic stamp)
- `chats` → missing `metadata`
- `chat_participants` → missing `updated_at` (role_in_chat, talkativity, initiative, muted_until, banned_until mutate; `joined_at` covers creation)
- `chat_invites` → missing `updated_at` (uses, status mutate)
- `chat_backgrounds` → missing `updated_at` (config, priority mutate)
- `shadow_notes` → missing `updated_at` (status, visibility mutate)
- `whitenotes` → missing `updated_at` (priority, scope, type mutate)
- `vn_choices` → missing `updated_at` (status, selected_option_id mutate)
- `workflow_sessions` → missing `created_at` (has `updated_at`; wizard state, no creation stamp)
- `e2e_sessions` → missing `updated_at` (chain keys, send_count, recv_count rotate per message)

**Context:**
Convention audit: `001_init.ts` defines `created_at text not null default (datetime('now'))` (see `users`) and several tables already carry all three columns (`actor_notes`, `chat_sections`, `story_turns`). Core chat entities partially predate that convention: `chats` has both stamps but no `metadata`, `messages` has `metadata` but no `updated_at`.

**Column definitions:**
- `created_at text` — on new tables `notNull default (datetime('now'))`; here added via ALTER as nullable (SQLite forbids non-constant DEFAULT in ADD COLUMN), backfilled, then always written by insert paths.
- `updated_at text` — nullable on add; maintained by writers on every UPDATE. NO SQLite trigger: 001_init triggers are integrity-only (locations path), and 011_actor_bdi_lite explicitly chose app-layer enforcement; no timestamp-maintenance trigger precedent exists.
- `metadata text` — nullable JSON object per row.

**Metadata compression + encryption (chats):**
`metadata text` stores a JSON object. Compression + encryption must reuse the existing pipeline, not new crypto: `src/crypto/pipeline.ts` `compressThenEncrypt()` / `decryptThenDecompress()`, tier-aware wrapper `src/crypto/at-rest.ts` (`encryptAtRest()` / `decryptAtRest()`), compression patterns per `src/content/compress.ts` and the `ContentEncoding` enum (none/gzip/zstd/brotli). Reading encrypted metadata requires the correct credentials + decryption key (chat key via `src/crypto/chat-keys.ts`, SMK via `src/crypto/smk.ts`); `chats.metadata` must never store plaintext secrets for encrypted chats — route through the same tier pipeline as chat content.

**Migration policy:**
- Append-only: new migration `018_*` (latest is `017_asset_links_archived_at.ts`). Never edit 001–017.
- Backfill in `up()`: `UPDATE messages SET updated_at = COALESCE(edited_at, created_at)`; for the other tables `UPDATE <t> SET updated_at = created_at WHERE updated_at IS NULL`; `workflow_sessions.created_at` has no source stamp — leave NULL for pre-existing rows rather than fabricating.
- Regenerate generated artifacts after the migration: `bun run db:sync-types && bun run db:sync-manifest`; `bun run schemas:check` must be green.

**Acceptance Criteria:**
- One `018_*` migration adds exactly the columns listed above to exactly the tables listed above; no other schema changes.
- Backfill UPDATEs present in `up()` as specified.
- Insert/update paths of affected services set `updated_at` (writers, not triggers).
- `bun run db:sync-types && bun run db:sync-manifest` run; `schemas:check` green.
- `chats.metadata` round-trips through the at-rest tier pipeline when the chat is encrypted.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
