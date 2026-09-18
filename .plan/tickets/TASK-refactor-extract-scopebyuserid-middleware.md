<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Refactor: extract scopeByUserId middleware

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done — landed on dev as `resolveActorAccess` + `resolvePrimaryActorId` (`src/routes/actor-access.ts`); sweep 2026-09-10: all `body.actorId`/`query.actorId` production hits guarded (participants, battle durability, crafting attempt/orders, trade offers/history/index, message-seen POST/DELETE)
**Priority:** high
**Effort:** Medium

## Summary

Source: 4 of 5 bugs in session-2026-09-03 were trust-boundary failures. Helper unblocks IDOR class fix across 17 routes.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (JSDoc on canonical helpers; no prose docs affected)

## Verification Notes (2026-09-10)

- Canonical implementation (dev): `src/routes/actor-access.ts` — `resolveActorAccess` (ownership check on client-supplied actorId) + `resolvePrimaryActorId` (server-derived persona; closes the client-actorId inversion per BUG-chat-seen-currentActorId-never-assigned).
- A parallel `scopeByUserId` middleware wrapper (`src/middleware/scope-by-user.ts`) was prototyped on branch `fix-trust-rpg-gating` and adopted only in message-seen; dropped in review as redundant — message-seen POST/DELETE are already guarded by the canonical helpers, and a second spelling adds confusion (actor id ≠ user id; the primary persona is a separate row).
