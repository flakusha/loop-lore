<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: char-growth-bridges

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium

## Summary

Skills / traits / relationships bridges (`src/characters/services/*-bridge.ts`) that wrap source-service writes with growth_log bookkeeping. Single dependency direction: bridges call into growth service; source services do not import growth types.

## Acceptance Criteria

- [ ] `recordSkillAcquisition` writes growth_log when `acquisitionSource === 'story'`
- [ ] `recordTraitDrift` re-checks `checkPersonalityIntegrity` and refuses locked categories
- [ ] `recordRelationshipShift` respects `evolution_tracked` and refuses static mode
