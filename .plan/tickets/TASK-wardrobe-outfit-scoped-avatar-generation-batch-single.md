<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wardrobe outfit-scoped avatar generation (batch + single)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-wardrobe-avatar-variants.md

## Summary

Generation: outfit-scoped batch/single jobs. Prompt composition slot = identity-anchor + outfit-descriptor + emotion-descriptor. Batch = emotion x selected outfit. Identity consistency via edit-model img2img fallback ladder (TASK-emotions-avatar-edit-model) or seed-locked txt2img. Integrates epic-avatar-regeneration-control scope params. Acceptance: regen respects outfit scope (re-roll angry-in-armor != touching angry-in-court-dress).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
