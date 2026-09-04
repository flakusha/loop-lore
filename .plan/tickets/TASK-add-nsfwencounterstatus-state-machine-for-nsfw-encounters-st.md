<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add NsfwEncounterStatus state machine for nsfw_encounters.status

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-chat-lifecycle-moderation

## Summary

Replace string-typed status in nsfw_encounters with NsfwEncounterStatus (active→paused→completed→abandoned). Expand the existing NsfwEncounterStatus machine (see Analysis), export from index, and use the existing `NsfwEncounters.status` COLUMN_TYPE_OVERRIDES mapping. No migration.

## Analysis (2026-09-04)

App-layer change only — **no migration needed** (column is `TEXT`, `nsfw_encounters.status` default `'active'` in fresh DDL). Caution: `NsfwEncounterStatus` **already exists** (`src/db/enums-character/nsfw.ts`) but only `active→completed`; this ticket wants `active→paused→completed→abandoned`. This is an **enum expansion** of the existing machine (add `paused`/`abandoned` values + transitions), not a new file. `COLUMN_TYPE_OVERRIDES["NsfwEncounters"]["status"]` already maps to `NsfwEncounterStatus`. No `src/db/migrations/*` change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
