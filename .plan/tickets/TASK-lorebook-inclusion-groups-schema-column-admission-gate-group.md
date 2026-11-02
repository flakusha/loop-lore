<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Lorebook inclusion groups: schema column, admission gate, group scoring

**Status:** Done
**Scope:** epic-lorebook-inclusion-groups
**Priority:** high
**Effort:** Medium
**Epic:** epic-lorebook-inclusion-groups
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Context

SillyTavern-style inclusion groups (mutually exclusive lore: only one entry per group fires; within a group the entry matching more keys wins) are absent. The existing `key_groups` column (`src/db/migrations/001_init.ts:589` world, `:904` actor) is ST *selective logic* (AND/OR sets, `src/assistant/prompt/keywords.ts:36-40`, consumed at `src/assistant/prompt/sections/lore-activation.ts:87-90`), NOT exclusivity. Admission is per-entry (`src/assistant/prompt/sections/lore.ts:161-162`); no one-entry-per-group semantics exist anywhere. Coverage check: `giwt search "inclusion group"` -> no matches.

Epic: epic-lorebook-inclusion-groups.md. Coordinate (no overlap) with TASK-lorebook-activation-search-scoring (51a1563), which covers *ranking* of matched entries, not exclusivity.

## Summary

- One nullable `inclusion_group` column on both lore tables (migration precedent: `084_lore_reveal_condition_timeline_rarity` added three columns to both tables in one migration).
- Extend keyword parsing/admission: after per-entry gates, group entries by `inclusion_group`; last-writer-wins per group becomes exclusive admission; within-group scoring where the entry matching more keys wins (generic fallback + specific overrides).
- Post-activation dedupe pass in `src/assistant/prompt/sections/lore-activation.ts`.

## Acceptance Criteria

- [x] `inclusion_group` nullable column on `world_lore_entries` + `actor_lore_entries` via a new forward migration. (`src/db/migrations/094_lorebook_inclusion_groups.ts`; regenerated artifacts: `src/db/schema-story.ts`, `src/db/schema-manifest.ts`, `src/validation/db-schemas.ts`, `src/test-utils/insert-helpers.ts`.)
- [x] Keyword-group parsing extended (entry can declare its inclusion group); parser unit-tested. (`parseInclusionGroup` in `src/assistant/prompt/keywords.ts`, unit-tested in `src/assistant/prompt/keywords.test.ts`.)
- [x] Admission gate: exactly one entry per inclusion group fires per turn; the winner is the entry matching more keys (tie -> priority/insertion_order); fixtures cover mutually-exclusive rumors (one of N fires). (`admitExclusiveGroups` in `src/assistant/prompt/sections/lore-activation.ts`, wired in `src/assistant/prompt/sections/lore.ts`; fixtures in `lore-activation.test.ts` + `lore-inclusion-groups.test.ts`.)
- [x] Fixtures cover: no-group entries unaffected; empty group; single-entry group; cooldown/rarity interplay. (`src/assistant/prompt/sections/lore-inclusion-groups.test.ts`.)

## Caveats

- [x] TOCTOU: none (pure prompt-assembly read path).
- [x] Partial failure: migration must be backward compatible (null group = today behavior). (NULL/blank group = no group; pre-existing rows keep today's admission.)
- [x] Stale state: entries changing group mid-chat take effect next turn only. (The gate runs per prompt assembly over the freshly loaded rows.)
- [x] Observability: dedupe pass logs group admits/skips. **Surface used: the repo's structured logger**, via the new child-logger module `src/assistant/prompt/sections/lore-logger.ts` (`getChildLogger("assistant/prompt/lore")`), which emits one `debug` line per group with the winner id and the skipped ids. *Why not the Prometheus counter map:* no lore-specific telemetry exists (no `lore` counters under `src/telemetry/`; `src/api-governance/telemetry/prometheus.ts` only exposes the `loop_lore_` product-prefixed counters), and a product-prefixed counter cannot attribute a skip to a group, while the logger carries the group name, winner and skipped ids.

**Context:**

SillyTavern-style inclusion groups were missing while the flat admission path was already per-entry. The column value is the source of truth for grouping; `parseInclusionGroup` trims it and maps blank/absent to `null` (= no group). The gate runs after the per-entry gates (audience, lifecycle, cooldown, reveal, stochastic) and before the priority sort, so cooldown/rarity still remove candidates before the group decides. Scoring: most matched keys wins, ties go to higher `priority`, then lower `insertion_order`, then collection order. `matchSelectiveKeys` replaced `matchesSelectiveKeys` and now returns `{ active, matched }` — the matched count is what the group ranks on (matched regex patterns / largest satisfied AND-group size / present plain keywords). Constant (non-selective) entries match 0 keys, so a specific selective entry overrides them in the same group ("generic fallback + specific overrides"). The column is not yet exposed through the lore-entry CRUD routes — it is settable via DB/import only; route exposure is a follow-up. Docs: the schema facts are generated (`src/db/schema-manifest.ts` and `src/validation/db-schemas.ts` are regenerated from the migrations), the plan/epic pages are served from the generated `docs/plan-gen/` mirror, and the hand-written surfaces were updated for this feature (`docs/spec/lore.md` — column + exclusivity rule; `docs/frontend/chat/prompt-creation.md` — group resolution step in the injection path). *Follow-up proposal, not built here:* the lore column reference in `docs/spec/` is still hand-written prose while the same facts are machine-readable in the generated manifest, so a generator could emit the lore-table column reference (and the migration-sequence table in `docs/spec/schema.md`, which has been stale since migration 008) from `src/db/schema-manifest.ts` into the VitePress build and remove that drift class.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (`docs/spec/lore.md`, `docs/frontend/chat/prompt-creation.md`, `CHANGELOG.md`; generated plan pages served from `docs/plan-gen/`)

**Resolved:** 2026-11-03 registry-driven close: git issue 6bad0ee (registry tip: d03b15433 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-LOREBOOK-INCLUSION-GROUPS-S)
