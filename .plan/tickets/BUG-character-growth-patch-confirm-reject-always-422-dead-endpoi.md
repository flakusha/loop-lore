<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: character-growth PATCH-confirm-reject always 422 dead endpoints

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

src/routes/character-growth/index.ts: PATCH /arc and POST growth-log/:entryId/confirm|reject declare params {actorId} but paths contain no :actorId placeholder, so Elysia always returns 422 and handlers are unreachable via HTTP (GETs are live). Found during unit-test-coverage-2 route coverage work. Fix: add :actorId to paths or drop the param.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
