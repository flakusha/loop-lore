<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: v1 route chain exceeds TS instantiation depth

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Closed — fixed in dev (verified 2026-09-18)

## Resolution

Commit `50f714a92` (2026-09-17) "fix(routes): split v1 .use() chain to clear TS2589; coverage tests" split the v1 barrel from a single 100+ `.use()` chain into 9 grouped `app = app.use(...)` assignments across `actors-surface.ts`, `admin-surface.ts`, `base-surface.ts`, `chats-surface.ts`, `content-surface.ts`, and `index.ts`. `bun run typecheck` green at HEAD; chain instantiation depth well under the limit. No further code change needed.
**Priority:** high
**Effort:** Medium

## Summary

dev's typecheck gate is red at HEAD: bun run typecheck (tsgo --noEmit -p tsconfig.backend.json) reports src/routes/v1/index.ts(132,5): error TS2589: Type instantiation is excessively deep and possibly infinite. Reproduced with real tsc too. The ~100 chained .use() calls in src/routes/v1/index.ts exceed TypeScript's instantiation depth after recent landings; the same file typechecks on older bases. Effect: every scripts/worktree finalize fails its project-wide static typecheck gate, so no branch can land without --force. Fix: split the chain into intermediate consts (route registration order preserved) so each expression's instantiation depth stays under the limit.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
