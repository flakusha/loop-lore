<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Refactor: typed Kysely upsert-by-unique-key helpers

**Status:** ✅ Done — helpers landed as `upsertByUnique` + `upsertByUniqueWith` + `insertUnique` (`src/db/upsert-helpers.ts` with motivating `@see BUG-chat-swipe-index-race`)
**Priority:** medium
**Effort:** Medium

## Summary

TASK-typed-kysely-upsert-helpers — see .plan/tickets/TASK-typed-kysely-upsert-helpers.md. Triggered by 08c2a95f (chat swipe_index race). Reusable helper for ON CONFLICT DO UPDATE.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
