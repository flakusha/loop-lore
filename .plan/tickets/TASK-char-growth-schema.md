<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: char-growth-schema

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium

## Summary

Fold growth schema into the parts tree: `character_arc` + `growth_log` tables and growth-mode columns on `actors` / `character_skills` / `character_relationships` / trait tables. Regenerate DB schemas via `db:sync-types` + `db:sync-manifest`.

See `.plan/epics/epic-character-growth.md` (Schema section).

## Acceptance Criteria

- [ ] Migration applies cleanly to dev DB (idempotent on rollback/replay)
- [ ] `bun run db:sync-types && bun run db:sync-manifest` succeeds
- [ ] `bun run schemas:check` green
- [ ] `bun test src/db/schema-sync.test.ts` green
