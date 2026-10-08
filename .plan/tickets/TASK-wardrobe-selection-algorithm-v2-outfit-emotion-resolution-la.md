<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wardrobe selection algorithm v2 (outfit, emotion) resolution ladder

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** completed 2026-10-01
**Priority:** high
**Effort:** Medium
**Epic:** epic-wardrobe-avatar-variants

## Summary

Selection algorithm v2 — (outfit, emotion) resolution with fallback ladder: (outfit,emotion) -> (outfit,neutral) -> (default,emotion) -> base avatar. Context overrides: chat > location > default. Deterministic + documented ladder; unit tests pin precedence. Acceptance: same actor renders different (outfit, emotion) combos across two chats in different locations without manual per-message choice.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
