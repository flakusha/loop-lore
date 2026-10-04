<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: DB: add created_at/updated_at/metadata to world-domain tables

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Summary:**
Add the repo's standard audit/extensibility columns to world-domain tables that lack them. Exact gaps:

- `worlds` → missing `metadata`
- `locations` → missing `metadata`
- `world_timelines` → missing `updated_at` (name, description, is_prime mutate)
- `world_event_steerings` → missing `updated_at` (status, conditions, manifest_probability mutate; `resolved_at` covers only resolution)
- `world_invites` → missing `updated_at` (uses, status mutate; mirrors `chat_invites`)
- `travel_routes` → missing `updated_at` (waypoints, seconds_per_unit, loop mutate)
- `travel_route_stops` → missing `created_at` (config child rows; rewritten with parent route)

**Context:**
Convention audit: `001_init.ts` defines `created_at text not null default (datetime('now'))` and most world tables already carry both stamps (`locations`, `location_states`, `world_items`, `world_lore_entries`). The gaps: the two core entities have stamps but no `metadata` column (feature tables like `world_avatar_config` and `location_nsfw_config` already do), and the timeline/steering/invite/travel tables carry mutable state with only `created_at` or none.

**Column definitions:**
- `created_at text` — new-table convention `notNull default (datetime('now'))`; here added via ALTER as nullable (SQLite forbids non-constant DEFAULT in ADD COLUMN), backfilled, then always written by insert paths.
- `updated_at text` — nullable on add; maintained by writers on every UPDATE. NO SQLite trigger: 001_init triggers are integrity-only (locations path triggers), no timestamp-maintenance trigger precedent exists; app-layer enforcement is the repo norm.
- `metadata text` — nullable JSON object per row.

**Metadata compression + encryption (worlds, locations):**
`metadata text` stores a JSON object. Compression + encryption support must reuse the existing pipeline: `src/crypto/pipeline.ts` `compressThenEncrypt()` / `decryptThenDecompress()`, tier-aware wrapper `src/crypto/at-rest.ts`, compression patterns per `src/content/compress.ts` + the `ContentEncoding` enum (none/gzip/zstd/brotli). Reading encrypted metadata requires the correct credentials + decryption key (chat keys via `src/crypto/chat-keys.ts`, SMK via `src/crypto/smk.ts`); world/location lore that is confidential must not land as plaintext in `metadata`.

**Migration policy:**
- Append-only: new migration `018_*` (latest is `017_asset_links_archived_at.ts`). Never edit 001–017.
- Backfill in `up()`: `UPDATE <t> SET updated_at = created_at WHERE updated_at IS NULL`; `travel_route_stops.created_at` has no source stamp — leave NULL for pre-existing rows rather than fabricating.
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
