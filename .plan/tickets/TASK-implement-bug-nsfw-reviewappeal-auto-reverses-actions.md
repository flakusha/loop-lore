<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Implement BUG-nsfw-reviewappeal-auto-reverses-actions

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-nsfw-moderation-priority

## Summary

Two-phase reversal: reviewAppeal(approved) records pending_reversal; new executeReversal(appealId) requires admin.users and a different admin to apply; superseded_by column; notify original moderator; carry reviewNote; audit both events.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue ab7f915 (registry tip: 4b8e21335 Konstantin Fedotov Close issue)
