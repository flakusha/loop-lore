<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Webhook rate-limit budget is consumed before signature verification

**Status:** Done
**Status Note:** fixed on this branch — the per-adapter delivery budget is now consumed only after `signaturesMatch` succeeds, and unauthenticated attempts are metered on their own `webhook-unverified:<adapter>` bucket, so unauthenticated junk POSTs can no longer force every legitimate delivery into 429 (`src/routes/v1/integrations-surface.ts:147-192`). Regression test in src/routes/v1/integrations-surface.test.ts ("unauthenticated junk POSTs do not consume the signed delivery budget").
**Priority:** medium
**Effort:** Small
**Caveats:** security — the verified-delivery budget is now spent only after the HMAC matches, so unauthenticated junk POSTs can no longer starve signed deliveries; the pre-verify flood protection moved onto its own per-adapter bucket (webhook-unverified:<adapter>), so junk still earns 429 without touching the delivery budget
**Tags:** security, integrations

**Summary:**

src/routes/v1/integrations-surface.ts:147-155 consumes the per-adapter webhook budget before the signature checks at :157-171; createRateLimiter.consume records unconditionally (src/middleware/rate-limit.ts:103-139). Unauthenticated junk POSTs (even with no signature header) burn the 30/60s budget and force every legitimate delivery into 429 for the window - unauthenticated availability attack on the inbound channel. Reproduced via .tmp/verify-concerns.ts: F2 valid delivery after 30 unsigned junk POSTs -> rate_limited. The middleware already exposes the intended gate-before-effect pattern (peek/record/refund, rate-limit.ts:96-101). Fix: verify the HMAC first, record budget only after signaturesMatch succeeds; keep any pre-verify flood protection on a separate client-identity-keyed limiter.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
