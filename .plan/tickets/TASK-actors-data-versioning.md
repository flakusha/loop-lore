<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actors — Data Versioning (version table + backfill)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-actors
**Summary:** Data versioning for the `actors` table — version table (v0–v4), bump-on-write migration contract, backfill script that promotes pre-existing rows to v4, and the migration-on-write runtime hook.
**Context:** gap-audit 2026-09-25 of `epic-actors` found a 1-line stub `TASK-actors.md` with no Acceptance Criteria. The spec calls for `version` tracking so v0 reads return v4-shaped objects transparently.
**Acceptance Criteria:** Migration adds `version INTEGER NOT NULL DEFAULT 4` (reversible); backfill script promotes existing rows to v4 idempotently in a single transaction; `readActorAtVersion` returns a v4-shaped object for any input version; `writeActor` bumps the version column on memory/lorebook/item writes (never decrements); existing actor tests still pass; `bun run check` green.

## Summary

Data versioning for the `actors` table: the 0–4 version table, the bump-on-write migration contract, the backfill script that promotes pre-existing rows to the current version, and the migration-on-write runtime hook.

## Background

`epic-actors` requires a `version` column on `actors` to track which generation of the data shape the row conforms to:

- **v0** — pre-stabilisation
- **v1** — character card fields
- **v2** — character card + memories
- **v3** — + lorebooks
- **v4** — + items (current)

Backward-compatibility contract: never remove columns, never repurpose, default values, migrate-on-write. The version column is monotonic per row; a v0 row on read is migrated to v4 in-flight before serving.

## Scope

- `src/db/schema-core.ts` — add `version: int` column on `actors` table interface; document v0–v4.
- `src/db/migrations/` — append-only migration to add the column with default `4` for new rows and a `backfillActors()` script that promotes existing rows to v4 idempotently.
- `src/characters/service/actor-version.ts` (new) — `readActorAtVersion(db, id)` returns the row migrated to the current shape; `writeActor(db, payload)` bumps the version on any field write that crosses a boundary.
- Unit + integration tests for: backfill (mixed-version fixture → all v4), migrate-on-read (v0 payload returns v4-shaped object), bump-on-write (writes that add memory push v1 → v2).

## Acceptance Criteria

- [ ] Migration adds `version INTEGER NOT NULL DEFAULT 4` and is reversible.
- [ ] Backfill script promotes all existing rows to v4 in one transaction; idempotent (re-running is a no-op).
- [ ] `readActorAtVersion` returns a v4-shaped object for any input version.
- [ ] `writeActor` bumps the version column when a memory/lorebook/item is added; never decrements.
- [ ] All existing actor tests still pass.
- [ ] `bun run check` green.

## Linked Tickets

- Companion tickets (this epic): `TASK-actors-child-tables-crud.md`, `TASK-actors-api-routes.md`, `TASK-actors-import-export.md`.
- Supersedes the 1-line stub `TASK-actors.md` (renamed/expanded by gap-audit 2026-09-25).


git issue: 9164e41
