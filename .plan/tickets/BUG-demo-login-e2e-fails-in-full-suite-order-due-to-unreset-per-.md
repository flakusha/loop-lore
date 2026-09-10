<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: demo-login e2e fails in full-suite order due to unreset per-IP demoLoginLimiter

**Status:** ✅ Resolved 2026-09-10 (worktree `core-hardening`, commit `86cee0c`): `tests/e2e/helpers/client.ts` `login()` now calls the pre-existing `resetDemoLoginRateLimiter()` (exported from `@/routes/auth`, previously never called) before each demo-login POST. Full `E2E_SAFEGUARD=1 bun test tests/e2e/` 251 pass / 0 fail across 30 files.
**Priority:** medium
**Effort:** Medium

## Summary

In full-suite runs of E2E_SAFEGUARD=1 bun test tests/e2e/ exactly 3 tests fail in tests/e2e/flows/auth.test.ts: POST /api/demo-login, GET /api/auth/me after login, POST /api/auth/logout (cascade: api.token null). Single-file run of auth.test.ts passes, so the failure is order-dependent: an earlier test file exhausts the process-global per-IP demoLoginLimiter budget on localhost. client.ts loginAs() resets the login limiter between files but nothing resets the demo-login limiter. Verified pre-existing: reproduced identically at dev 94b41c690 (pre edge-case batch) and 6619b3d71 (post batch) via bisect worktree. Fix direction: reset demoLoginLimiter where loginAs() resets the login limiter, or scope the limiter to the test server instance in tests/e2e/helpers/server.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
