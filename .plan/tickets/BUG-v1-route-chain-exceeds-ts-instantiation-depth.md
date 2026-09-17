<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: v1 route chain exceeds TS instantiation depth

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

dev's typecheck gate is red at HEAD: bun run typecheck (tsgo --noEmit -p tsconfig.backend.json) reports src/routes/v1/index.ts(132,5): error TS2589: Type instantiation is excessively deep and possibly infinite. Reproduced with real tsc too. The ~100 chained .use() calls in src/routes/v1/index.ts exceed TypeScript's instantiation depth after recent landings; the same file typechecks on older bases. Effect: every scripts/worktree finalize fails its project-wide static typecheck gate, so no branch can land without --force. Fix: split the chain into intermediate consts (route registration order preserved) so each expression's instantiation depth stays under the limit.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
