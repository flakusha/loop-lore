---
hash: 396b5e3
---


**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Logger tests leak global logger state

**Status:** ✅ Finished (dev commit `02d2d1156`) — test isolation via `withLogger` helper.

## Resolution

- **Resolved**: 2026-09-10
- **Commit(s)**: 02d2d1156 fix(tests): isolate global logger state and demo-login limiter
- **Notes**: `src/logger/index.test.ts` and `src/logger/logger.test.ts` now capture the global root in `beforeEach` (guarded `getLogger`, tolerates uninitialized) and restore it in `afterEach` (fallback: fresh `createLogger({ level: "error" })`). `bun test src/logger/` 120 pass; full e2e suite 251 pass.

**Priority:** Medium
**Effort:** Medium

## Summary

src/logger/index.test.ts 'getLogger throws before init' sets setGlobalLogger(null) without restoring, and src/logger/logger.test.ts tests 3-4 call setGlobalLogger without restore. Same defect class as the idempotency test leak fixed in BUG-middleware-idempotency-table-backend-unimplemented strict-review pass 10: global _root.instance mutation without capture/restore leaks state across tests; a bare setGlobalLogger(null) makes any later getLogger() throw if ordering changes. Fix pattern: capture getLogger() before setGlobalLogger, restore in finally (see src/middleware/idempotency.test.ts pass-10 fix). Found during F14 pass-11 surface audit; out of scope there, tracked here.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated
