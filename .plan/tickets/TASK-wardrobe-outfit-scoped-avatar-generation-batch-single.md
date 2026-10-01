<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wardrobe outfit-scoped avatar generation (batch + single)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** completed 2026-10-01
**Priority:** high
**Effort:** Medium
**Epic:** epic-wardrobe-avatar-variants.md

## Summary

Generation: outfit-scoped batch/single jobs. Prompt composition slot = identity-anchor + outfit-descriptor + emotion-descriptor. Batch = emotion x selected outfit. Identity consistency via edit-model img2img fallback ladder (TASK-emotions-avatar-edit-model) or seed-locked txt2img. Integrates epic-avatar-regeneration-control scope params. Acceptance: regen respects outfit scope (re-roll angry-in-armor != touching angry-in-court-dress).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
