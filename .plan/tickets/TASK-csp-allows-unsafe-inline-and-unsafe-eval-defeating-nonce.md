<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: CSP allows unsafe-inline and unsafe-eval defeating nonce

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** critical
**Effort:** Medium

## Summary

src/config/sections/headers.ts:30 sets scriptSrc to self, unsafe-inline, unsafe-eval. unsafe-inline nullifies the per-request nonce so any injected inline script runs; unsafe-eval permits eval/new Function. Fix: drop both, self-host Alpine/htmx, rely on nonce in globalThis.__cspNonce. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
