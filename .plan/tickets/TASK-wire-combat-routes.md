<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire Combat Routes

**Status:** ✅ Done (2026-08-14, `51a7bc01`) — combat wired to HTTP (`src/routes/rpg/combat.ts` + tests); battle UI glue in `src/battle/` already shipped
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-rpg-mechanics

## Summary

Mount the code-complete combat pure engine (`src/rpg/combat/`, in-memory, NO DB schema) as stateless resolution endpoints — roll initiative, resolve attack/damage — using the WIRED-7 mount pattern. Currently has ZERO production consumers; as a stateless engine it needs no persistence.

## Acceptance Criteria

- [ ] Elysia route factory mounts combat pure engine as stateless resolution endpoints (roll initiative, resolve attack/damage), using `requireUserId` / `requireActorAccess` gating + `jsonResponse`/`jsonError` from `src/routes/http-utils`
- [ ] Routes register + typecheck cleanly
- [ ] Unit route tests added (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`); no DB required

## Linked Epics

- `epic-rpg-mechanics.md`


git issue: 1cfb14a
