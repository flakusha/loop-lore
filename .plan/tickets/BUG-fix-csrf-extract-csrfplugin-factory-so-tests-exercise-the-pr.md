# BUG: fix(csrf): extract csrfPlugin factory so tests exercise the production wiring

**Status:** ✅ Closed (commits a4ae0e30 + 427d9344 on dev)
**Priority:** Medium
**Effort:** Medium

## Summary

The CSRF middleware had its `onBeforeHandle` / `onAfterHandle` wiring duplicated between `src/elysia-app.ts` and `src/middleware/csrf.integration.test.ts`. Production code and tests had drifted apart — a fix to one wouldn't reach the other. Extract a single `csrfPlugin` factory in `src/middleware/csrf-plugin.ts` and import it from both consumers.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

- `a4ae0e30 refactor(csrf): extract csrfPlugin to its own file so tests exercise production wiring`
- `427d9344 refactor(csrf): extract csrfPlugin factory so tests exercise production wiring`

Both elysia-app.ts and csrf.integration.test.ts now share `csrfPlugin` from `src/middleware/csrf-plugin.ts`. The legacy duplicate definitions in `csrf.ts` were dropped (commit `62509c9a`).