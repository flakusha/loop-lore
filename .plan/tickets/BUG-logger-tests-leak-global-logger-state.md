<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Logger tests leak global logger state

**Status:** ✅ Resolved 2026-09-10 (worktree `core-hardening`, commit `86cee0c`): both files now capture the global root in `beforeEach` (guarded `getLogger`, tolerates uninitialized) and restore it in `afterEach` (fallback: fresh `createLogger({ level: "error" })`). `bun test src/logger/` 120 pass; full e2e suite 251 pass.
**Priority:** Medium
**Effort:** Medium

## Summary

src/logger/index.test.ts 'getLogger throws before init' sets setGlobalLogger(null) without restoring, and src/logger/logger.test.ts tests 3-4 call setGlobalLogger without restore. Same defect class as the idempotency test leak fixed in BUG-middleware-idempotency-table-backend-unimplemented strict-review pass 10: global _root.instance mutation without capture/restore leaks state across tests; a bare setGlobalLogger(null) makes any later getLogger() throw if ordering changes. Fix pattern: capture getLogger() before setGlobalLogger, restore in finally (see src/middleware/idempotency.test.ts pass-10 fix). Found during F14 pass-11 surface audit; out of scope there, tracked here.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
