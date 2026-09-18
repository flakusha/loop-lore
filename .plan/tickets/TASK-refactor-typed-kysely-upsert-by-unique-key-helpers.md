<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Refactor: typed Kysely upsert-by-unique-key helpers

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done — helpers landed as `upsertByUnique` + `upsertByUniqueWith` + `insertUnique` (`src/db/upsert-helpers.ts` with motivating `@see BUG-chat-swipe-index-race`)
**Priority:** medium
**Effort:** Medium

## Summary

Triggered by 08c2a95f (chat swipe_index race). Reusable helper for ON CONFLICT DO UPDATE.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
