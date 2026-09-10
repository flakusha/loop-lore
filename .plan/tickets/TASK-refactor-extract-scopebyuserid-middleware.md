<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Refactor: extract scopeByUserId middleware

**Status:** ✅ Done — helper landed as `resolveActorAccess` + `resolvePrimaryActorId` (`src/routes/actor-access.ts`); sweep 2026-09-10: all `body.actorId`/`query.actorId` production hits guarded (participants, battle durability, crafting attempt/orders, trade offers/history/index)
**Priority:** high
**Effort:** Medium

## Summary

TASK-extract-scope-by-user-id-middleware — see .plan/backlog/open-debt.md. Source: 4 of 5 bugs in session-2026-09-03 were trust-boundary failures. Helper unblocks IDOR class fix across 17 routes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
