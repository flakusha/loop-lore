<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Refactor: trust-boundary audit pass

**Status:** ✅ Done — sweep 2026-09-10: zero unguarded `body.actorId`/`query.actorId` hits in `src/routes/` (all pass through `resolveActorAccess`); every `world_id` query scoped (`worldScoped` helper or explicit `WHERE world_id = ?`); no migration needed
**Priority:** critical
**Effort:** Medium

## Summary

TASK-trust-boundary-audit-pass — see .plan/tickets/TASK-trust-boundary-audit-pass.md. Cross-cutting migration sweep adopting helpers from TASK-extract-scope-by-user-id-middleware + TASK-lift-world-scope-to-shared-helper. 4 of 5 bugs in session-2026-09-03 were trust-boundary class.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
