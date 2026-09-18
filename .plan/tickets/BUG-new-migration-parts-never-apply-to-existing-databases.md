<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: New migration parts never apply to existing databases

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** [OK] Done
**Priority:** Medium
**Effort:** Medium

## Summary

Single 001_init migration is tracked as one unit by Kysely Migrator (migrateToLatest skips it once applied), so parts 019 (requested_materials column), 020 (memories_fts triggers+reshape), 021 (workflow_sessions) only ever execute on fresh databases. Long-lived DBs silently miss schema: trade code reads a missing column, memories keyword stays dead, workflow tables absent. Companion: e8f2f504 removed the column line from shipped 009_crafting (append-only violation; convergent only for fresh DBs). Fix candidates: (a) idempotent schema-backfill data-migrations via existing src/db/data-migrations runner, (b) per-part migration records.

## Acceptance Criteria (superseded — see Resolution below)

## Resolution

Closed 2026-09-15. Fix is live on dev: `src/db/schema-backfill.ts`
(`runSchemaBackfill`, imported at `src/server/start.ts:12`, called at
`:108` immediately after `runMigrations`) converges every stranded case
with probe-then-repair guards (cheap no-ops on fresh DBs):
- `chat_setup_templates.visual_novel` → merged into
  `gm_config.renderingOverride`, column dropped.
- `memories_fts` (broken 016 rowid alias + missing trigger trio) →
  rebuilt in fixed shape with triggers, backfilled from `actor_memories`.
- `crafting_orders.requested_materials` (part 019) → column + `[]` default.
- `workflow_sessions` (part 020), `mesh_reservations`/`mesh_deliveries`
  (part 022), `world_event_steerings` (folded 003) → tables + version
  records via `recordSchemaVersion`.
- Mesh/steering sub-repairs split into `schema-backfill-mesh.ts` /
  `schema-backfill-steering.ts`.

Verified: `bun test src/db/schema-backfill.test.ts` → 10 pass, 0 fail,
44 expects (visual_novel merge, fts rebuild, requested_materials default,
workflow/mesh/keys/steerings creation).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (module doc-comment in `schema-backfill.ts`
  is the retention/extension contract: "add future stranded guards here")
