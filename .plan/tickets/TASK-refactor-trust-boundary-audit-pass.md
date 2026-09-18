<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Refactor: trust-boundary audit pass

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done — sweep 2026-09-10: zero unguarded `body.actorId`/`query.actorId` hits in `src/routes/` (all pass through `resolveActorAccess`); every `world_id` query scoped (`worldScoped` helper or explicit `WHERE world_id = ?`); no migration needed
**Priority:** critical
**Effort:** Medium

## Summary

Cross-cutting migration sweep. 4 of 5 bugs in session-2026-09-03 were trust-boundary class.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
