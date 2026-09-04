<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add NsfwEncounterStatus state machine for nsfw_encounters.status

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-chat-lifecycle-moderation

## Summary

Replace string-typed status in nsfw_encounters with NsfwEncounterStatus (active→paused→completed→abandoned). The 012_features.ts migration defaults to 'active'. Must create src/db/enums-core/nsfw-encounter-status.ts with StateDef + createMachine, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
