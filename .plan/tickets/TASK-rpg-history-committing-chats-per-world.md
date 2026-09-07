<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: history-committing chats per world

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-mechanics-governance.md

## Summary

Gap G11 (verified): history mutable (PATCH edit, soft-hide, hard delete); only swipes append-only. Add per-world history_mode mutable|committed; committed chats reject PATCH/hide (403+reason), canon events append to timeline via promote-lore. CONSTRAINT: GDPR ?hard=true delete must keep working (legal override, logged). Plan doc batch 3 #11. Epic: epic-mechanics-governance.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
