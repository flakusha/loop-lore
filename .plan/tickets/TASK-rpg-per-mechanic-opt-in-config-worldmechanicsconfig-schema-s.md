<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: per-mechanic opt-in config (WorldMechanicsConfig schema slice)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Implemented
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-mechanics-governance.md

## Summary

Gap G5 (verified): opt-in is one boolean worlds.rpg_enabled (003_worlds.ts); epic-mechanics-governance.md Not Started. Implement its WorldMechanicsConfig schema slice: APPEND-ONLY migration adding per-mechanic flags (dice, checks, combat, xp, loot, quests) defaulting to current rpg_enabled value (parity), getMechanicsConfig(worldId) read path, wire dice/checks flags into chat gate. Admin/GM UI stays in governance epic. Plan doc §3.5. Epic: epic-mechanics-governance.md.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (JSDoc on gate + migration docblock; Admin/GM UI stays in governance epic)

## Verification Notes (2026-09-10)

- Migration: `src/db/migrations/004_world_mechanics.ts` — top-level (NOT a `001_init` part; `001_init.ts` is frozen per `src/db/migrations.test.ts:413`, so appended parts silently skip on existing DBs). Six `rpg_*` columns + parity backfill from `rpg_enabled`, `recordSchemaVersion` 25 (`:54`). Roundtrip (up→down→up) green.
- Read path: `src/rpg/service/world-gate.ts:83` (`getMechanicsConfig`), `:142` (`checkCommandMechanic`); dice/checks flags wired into the chat gate.
- Writers: `src/routes/worlds/worlds.ts` + `src/routes/worlds/world-rpg-flags.ts` + `src/validation/schemas/worlds.ts`; artifacts regenerated (`schema-story.ts`, `insert-helpers.ts`, `db-schemas.ts`, `schema-manifest.ts`).
- Tests: `src/rpg/service/world-gate.test.ts` + `src/routes/worlds/worlds-routes.test.ts`; 88/88 pass across the worktree batch.
- Gate: `bun run check` green (21/21) on branch `trust-rpg-gating` (re-based review of `fix-trust-rpg-gating`, cherry-picked off current dev).
