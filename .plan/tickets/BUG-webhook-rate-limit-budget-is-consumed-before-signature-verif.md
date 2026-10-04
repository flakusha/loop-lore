<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Webhook rate-limit budget is consumed before signature verification

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Tags:** security, integrations

**Summary:**

src/routes/v1/integrations-surface.ts:147-155 consumes the per-adapter webhook budget before the signature checks at :157-171; createRateLimiter.consume records unconditionally (src/middleware/rate-limit.ts:103-139). Unauthenticated junk POSTs (even with no signature header) burn the 30/60s budget and force every legitimate delivery into 429 for the window - unauthenticated availability attack on the inbound channel. Reproduced via .tmp/verify-concerns.ts: F2 valid delivery after 30 unsigned junk POSTs -> rate_limited. The middleware already exposes the intended gate-before-effect pattern (peek/record/refund, rate-limit.ts:96-101). Fix: verify the HMAC first, record budget only after signaturesMatch succeeds; keep any pre-verify flood protection on a separate client-identity-keyed limiter.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
