<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: char-growth-types

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Small

## Summary

Add `src/characters/spec/growth.ts` (GrowthMode, ArcStage, GrowthAxis, GrowthEventType, GrowthEntryStatus, CharacterArc, GrowthLogEntry, InsertGrowthLogInput, UpsertArcInput). Extend `CanonicalCharacter` with optional `growth_mode` + `llm_assist_enabled` fields.

## Acceptance Criteria

- [ ] All growth types exported and used consistently across the service
- [ ] `CanonicalCharacter.growth_mode` defaults to `'dynamic'` when absent
- [ ] `CanonicalCharacter.llm_assist_enabled` defaults to `false` when absent
