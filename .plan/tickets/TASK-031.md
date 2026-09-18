<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-031: Character vs World Data Separation

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Type-level boundary between character-owned and world-owned fields; APIs reject cross-boundary writes.
**Context:** Schema split + migration + API guards.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: open
**Priority**: medium
**Effort**: Medium
**Labels**: character, world, data-model, architecture
**Assignee**:
**Epic**: epic-character-world-setup
**Related**:

## Summary

Establish a clean schema boundary between character-owned data (persona, traits, stats, license) and world-owned data (locations, factions, lore, scene metadata) so characters can be ported across worlds without losing identity.

## Context

Today character records bleed world references and vice versa. This ticket formalizes the split, migrates existing data, and updates the read/write APIs to respect the boundary. IN: schema diff, migration script, API guards. OUT: cross-world federation, world marketplace, NPC ownership transfer.

## Acceptance Criteria

- Character schema excludes world-owned fields (locations, factions, scene refs) at the type level
- World schema excludes character-owned fields (persona, traits, stats) at the type level
- Migration script backfills the boundary without losing existing data
- APIs reject cross-boundary writes with a clear 422 explaining the violation
- Documentation explains which fields live where and the rationale

## Related Files

- src/character/schema.ts
- src/world/schema.ts (to be created)
- src/migrations/character-world-split.ts (to be created)
- docs/architecture/character-world-boundary.md (to be created)

## Notes

- Coordinate with TASK-030 (character creator licensing) — license metadata is character-owned
- Sibling of BUG-avatar-select-* tickets that touch world-layer traits

Git issue: `ec1aa6f`
