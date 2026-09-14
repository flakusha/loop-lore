<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: FE-BE: character-growth arc/confirm/reject declare unsatisfiable actorId param, Elysia 422s every call

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

BE src/routes/character-growth/index.ts PATCH ${R}/arc + POST growth-log/:entryId/confirm + POST growth-log/:entryId/reject declare params actorId that no route path carries (actorId arrives via ?query). Elysia validates params first and 422s before the handler, so FE src/frontend/character-growth-editor.ts saveArc/confirmEntry/rejectEntry can never succeed. Coverage test routes.coverage.test.ts:191 asserts the 422s (documents the bug, not the contract). Fix: params schema { entryId } only, read actorId from query via getString como listGrowthLog does. Verify: harmony diff loses 3 findings; coverage test expects 200-path behavior.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
