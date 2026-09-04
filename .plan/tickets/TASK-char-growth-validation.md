<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: char-growth-validation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Small

## Summary

Extend `src/characters/validator/fields.ts` with `validateGrowthFields` and wire it into the `validateCharacter` orchestrator. Validates `growth_mode` enum and `llm_assist_enabled` boolean.

## Acceptance Criteria

- [ ] `growth_mode` rejects unknown values
- [ ] `llm_assist_enabled` rejects non-boolean values
- [ ] Both fields are optional: relaxed mode accepts absence
