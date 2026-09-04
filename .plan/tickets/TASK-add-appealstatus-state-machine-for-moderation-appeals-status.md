<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add AppealStatus state machine for moderation_appeals.status

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-chat-lifecycle-moderation

## Summary

Replace string-typed status in moderation_appeals with AppealStatus state machine (pending→approved/denied). The 021_nsfw_appeals.ts migration has status defaulting to 'pending' with comment 'pending | approved | denied'. Must create src/db/enums-core/appeal-status.ts with StateDef + createMachine, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
