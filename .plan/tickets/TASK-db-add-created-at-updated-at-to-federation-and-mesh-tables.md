<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: DB: add created_at/updated_at to federation and mesh tables

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

**Summary:**
Add `created_at` / `updated_at` to federation/mesh/transport tables whose mutable state has no update stamp. Exact gaps:

- `mesh_peers` → missing `updated_at` (state, capabilities, capacity_bytes mutate; `last_seen` covers only liveness)
- `mesh_negotiations` → missing `created_at` (has `updated_at`; negotiation state machine)
- `mesh_reservations` → missing `updated_at` (state, expires_at mutate)
- `activitypub_actor_keys` → missing `updated_at` (status/rotated_at lifecycle; `user_api_keys` and `actor_keys` precedent for key-table stamps)

**Context:**
Convention audit: `001_init.ts` defines `created_at text not null default (datetime('now'))`. Mesh tables split inconsistently: `mesh_inbound_keys` already carries `created_at`+`updated_at`, while `mesh_peers`/`mesh_negotiations`/`mesh_reservations` carry mutable protocol state with only one stamp (or none). Append-only transport logs (`mesh_deliveries` with `received_at`) are intentionally not flagged.

No metadata proposed for this subsystem: peer/key/reservation rows hold protocol-defined state, not extensible entity data.

**Column definitions:**
- `created_at text` — new-table convention `notNull default (datetime('now'))`; here added via ALTER as nullable (SQLite forbids non-constant DEFAULT in ADD COLUMN), backfilled, then always written by insert paths.
- `updated_at text` — nullable on add; maintained by writers on every UPDATE. NO SQLite trigger: 001_init triggers are integrity-only (locations path), no timestamp-maintenance trigger precedent exists.

**Migration policy:**
- Append-only: new migration `018_*` (latest is `017_asset_links_archived_at.ts`). Never edit 001–017.
- Backfill in `up()`: `UPDATE mesh_negotiations SET created_at = updated_at`; `mesh_peers`/`mesh_reservations`: `UPDATE <t> SET updated_at = last_seen WHERE updated_at IS NULL` (peers) and `= created_at` (reservations); rows with no source stamp stay NULL rather than fabricating.
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
