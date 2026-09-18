# TASK: Adopt @elysiajs/helmet for security headers

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Add @elysiajs/helmet plugin for centralized security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy). Config-driven policy with documented CSP unsafe-inline rationale for htmx+Alpine.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Superseded (2026-09-18)

Every item in this ticket's scope is already landed by the response-headers engine: CSP (per-request nonce via `src/middleware/csp-nonce.ts`, no `unsafe-inline`), HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy — all config-driven via the `headers` domain (`src/config/sections/headers.ts`, `configs/config.headers.example.*`) and unit-tested (`src/middleware/response-headers.test.ts`). Adding `@elysiajs/helmet` would duplicate this machinery; no adoption planned. Candidate for closure.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
