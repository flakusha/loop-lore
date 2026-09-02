<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Resource Provision Schema & Migrations

**Status:** ⬜ Open
**Priority:** high
**Effort:** medium
**Epic:** epic-resource-provision
**Issue:** TBD
**Related:**
- `TASK-resource-provision-credential-store`
- `TASK-resource-provision-quota-engine`

## Summary

Create the Kysely schema and migrations for resource records, backup
records, and quota counter tables. Every downstream ticket depends on
this foundation.

## Context

The resource provision epic introduces three new persistent concerns:

1. **Resource records** — a user-owned external endpoint plus its
   verifiable credential reference and quota ceiling.
2. **Backup records** — browser-exported blobs anchored to a content hash
   so reconciliation can detect drift.
3. **Quota counters** — per-resource, per-window counters that the quota
   engine must persist and reset.

The existing `src/db/schema.ts` / `src/db/schema-manifest.ts` are
auto-generated from migrations, so these tables must live in a new
migration file; the generated files will be regenerated via
`bun run db:sync-types && bun run db:sync-manifest`.

## Acceptance Criteria

- [ ] Migration `src/db/migrations/` adding `resource_records` table
  (columns: `id`, `owner_id`, `type`, `provider`, `endpoint`,
  `credential_ref`, `quota_json`, `status`, `created_at`, `last_used_at`)
- [ ] Migration adding `backup_records` table
  (columns: `id`, `resource_type`, `owner_id`, `content_hash`,
  `server_hash`, `payload`, `version`, `created_at`, `storage_quota_bytes`)
- [ ] Migration adding `resource_quota_counters` table
  (columns: `resource_id`, `window_start`, `requests`, `tokens`,
  `storage_bytes`, `compute_hours`, `concurrency`)
- [ ] `resource_records.id` is a deterministic hash of
  `(owner_id, type, provider, endpoint)` so the same logical resource
  always maps to the same row
- [ ] `resource_records.credential_ref` column accepts only a hash or
  wrapped-key reference (no plaintext column)
- [ ] Foreign keys: `owner_id` → `actors.id`; no cascade deletes on
  resource records (preserve audit trail)
- [ ] `bun run db:sync-types && bun run db:sync-manifest` succeeds
- [ ] `bun run schemas:check` passes
- [ ] `bun run check` gate green on the new schema
- [ ] `src/test-utils/insert-helpers.ts` updated for the new tables
- [ ] Unit tests for migration up/down
