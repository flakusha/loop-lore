<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: char-growth-service

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** High
**Effort:** Medium

## Summary

Implement `src/characters/services/growth-service/` (index, types, crud, redact, llm-assist). Public API: `CharacterGrowthService` with `getGrowthMode`, `getArc`, `upsertArc`, `insertGrowthLog`, `listGrowthLog`, `confirmGrowthEntry`, `rejectGrowthEntry`. Enforces static-mode refusal (D4) at insert time.

## Acceptance Criteria

- [ ] `CharacterGrowthService` exposes the full surface described in the plan
- [ ] Static mode refuses growth_log inserts except `arc_stage_set`
- [ ] `redactForPlayerCard()` filters applied-only and strips internal fields
- [ ] `runLlmAssist()` produces pending entries when `llm_assist_enabled=true`
