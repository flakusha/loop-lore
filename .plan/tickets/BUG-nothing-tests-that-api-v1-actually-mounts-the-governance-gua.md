<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Nothing tests that /api/v1 actually mounts the governance guard end to end

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

`src/routes/v1/index.ts:57` mounts `governanceGuard({ enabled: () => process.env.E2E_SAFEGUARD !== "1" })`. When the safeguard is set — and `scripts/run-browser-tests.ts:29-30` sets it on EVERY browser-suite child unconditionally (spread-then-overwrite), so it is always set for browser tests — `src/routes/v1/governance.ts:37` and `:65` both early-return, disabling per-user rate limiting AND `metrics.recordRequest`.

Consequence, verified by grep: no e2e test asserts `429`, `Rate limit`, `rate_limited_total`, `/metrics`, or `governanceGuard`. Across all 35 files in `tests/e2e/flows/browser/` there are ZERO matches for `429|Rate limit|rate-limit|ratelimit|metrics`. Across all of `tests/e2e/` the only hits are a status-code label table (`tests/e2e/helpers/htmx-alpine.ts:60`) and an import of a DIFFERENT limiter (`tests/e2e/flows/edge-cases-register.test.ts:21` — the register/IP limiter, whose assertions only check `status < 500`).

What IS covered: `src/routes/v1/governance.test.ts` (5 rate-limit tests: 429 on the 11th request, policy namespacing, unauthenticated bypass, RateLimit headers, exactly-one-telemetry-increment) and `src/api-governance/telemetry/collector.test.ts` (4 tests). Both construct the guard directly and are immune to the flag — `makeApp` calls `governanceGuard()` with no opts so `enabled` defaults to `() => true`.

WHAT IS NOT COVERED — the integration seam: that `/api/v1` routes actually mount the guard, that `policyForRoute` selects the correct policy per route prefix, and that request telemetry reaches `/metrics` over a real HTTP server. `governance.test.ts:117-128` exercises `/metrics` via `app.handle` on a hand-built app, NOT through `v1Routes`. A regression in the `index.ts:57` wiring, the policy mapping, or the `onAfterHandle`→`/metrics` path over a real server would ship green.

Fix direction: an integration test that boots the real v1 router and asserts a rate-limited response AND that `/metrics` received the request counter — deliberately WITHOUT the safeguard set, so the guard is live.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
