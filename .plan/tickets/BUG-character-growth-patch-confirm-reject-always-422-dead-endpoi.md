<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: character-growth PATCH-confirm-reject always 422 dead endpoints

**Status:** ✅ Done — duplicate of BUG-fe-be-character-growth-arc-confirm-reject-declare-unsatisfia (resolved on dev by 00d2c1201 + 70e9cb6eb, 2026-09-14)
**Priority:** Medium
**Effort:** Medium

## Summary

src/routes/character-growth/index.ts: PATCH /arc and POST growth-log/:entryId/confirm|reject declare params {actorId} but paths contain no :actorId placeholder, so Elysia always returns 422 and handlers are unreachable via HTTP (GETs are live). Found during unit-test-coverage-2 route coverage work. Fix: add :actorId to paths or drop the param. DUPLICATE: canonical ticket BUG-fe-be-character-growth-arc-confirm-reject-declare-unsatisfia documents the same defect with fuller FE-BE analysis and is ✅ Resolved on dev (00d2c1201 query-actorId fix + 70e9cb6eb FE URL pinning; routes now declare `params: { entryId }` + `query: { actorId }`, matching listGrowthLog GET pattern). No code change in this ticket.

## Acceptance Criteria

## Resolution

Duplicate. Fixed on dev by `00d2c1201` + `70e9cb6eb` (see canonical ticket Resolution). Verified live: current `src/routes/character-growth/index.ts` declares `query: t.Object({ actorId })` on all five routes and `params: t.Object({ entryId })` only on confirm/reject; `routes.coverage.test.ts` (10 pass) asserts the query-actorId contract including a 200/404/409 happy-path probe. No code change required.

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
