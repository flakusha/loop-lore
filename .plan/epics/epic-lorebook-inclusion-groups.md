<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Lorebook Inclusion Groups + Group Scoring

**Effort:** Small
**Type:** epic
**Tags:** lorebook, world-info, activation, sillytavern-parity
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** High

## Summary

ST-style inclusion groups for lorebooks: mutually exclusive entries where only one entry per group fires per turn, and within-group scoring where the entry matching more keys wins (generic fallback + specific overrides). Verified Absent: the existing `key_groups` column (`001_init.ts:589` world, `:904` actor) is ST *selective logic* (AND/OR sets, `src/assistant/prompt/keywords.ts:36-40`, consumed at `src/assistant/prompt/sections/lore-activation.ts:87-90`), not exclusivity; admission is per-entry (`src/assistant/prompt/sections/lore.ts:161-162`). Coverage check: `giwt search "inclusion group"` → no matches (2026-11-01).

## Scope

- Nullable `inclusion_group` column on `world_lore_entries` + `actor_lore_entries` (migration precedent: `084_*` added three columns to both tables in one migration).
- Keyword-group parsing extension + post-activation dedupe/admission gate (last-writer-wins per group; more-key-hits wins within a group).
- Fixtures for exclusive-rumor semantics and non-regression of flat activation.

## Related Epics

- `epic-memory-knowledge-systems.md` — lore activation home.
- Coordinate (no overlap) with ticket `TASK-lorebook-activation-search-scoring` (`51a1563`): ranking of matched entries, not exclusivity.

## Tickets

- `TASK-lorebook-inclusion-groups-schema-column-admission-gate-group` (`6bad0ee`, High) — schema column + parse extension + admission gate + fixtures.

## Open Questions

None — the research doc lists no blocking questions for this epic (the `key_groups` confusion was resolved in review: it is selective logic, not inclusion groups).
