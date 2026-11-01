<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Lorebook inclusion groups: schema column, admission gate, group scoring

**Status:** Not Started
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

- [ ] `inclusion_group` nullable column on `world_lore_entries` + `actor_lore_entries` via a new forward migration.
- [ ] Keyword-group parsing extended (entry can declare its inclusion group); parser unit-tested.
- [ ] Admission gate: exactly one entry per inclusion group fires per turn; the winner is the entry matching more keys (tie -> priority/insertion_order); fixtures cover mutually-exclusive rumors (one of N fires).
- [ ] Fixtures cover: no-group entries unaffected; empty group; single-entry group; cooldown/rarity interplay.

## Caveats

- [ ] TOCTOU: none (pure prompt-assembly read path).
- [ ] Partial failure: migration must be backward compatible (null group = today behavior).
- [ ] Stale state: entries changing group mid-chat take effect next turn only.
- [ ] Observability: dedupe pass logs group admits/skips via existing lore telemetry.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
