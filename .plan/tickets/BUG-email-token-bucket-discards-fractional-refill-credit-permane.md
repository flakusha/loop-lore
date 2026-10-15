<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Email token bucket discards fractional refill credit, permanently starving senders below one token per refill

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Location: src/integrations/health.ts:246-248 (refill math) and :250-252 (skewed retryAfterMs); default rule capacity 10 / refillMs 60_000 at src/integrations/email/spam-gate.ts:24.

Evidence: tokens += Math.floor(elapsed / refillMs) then lastRefillAt = nowMs unconditionally - elapsed time that does not reach a full refill period is discarded AND the anchor is advanced anyway. A sender consuming every 50 s (rate 1.2/min, well under the 10/min cap) is denied after the initial burst and the bucket never regenerates: the 10 s remainder is thrown away every cycle. retryAfterMs is computed from the pre-reset elapsed (:251), under-reporting the true wait by up to refillMs.

Verification: REPRODUCED - probe .tmp/glm-review/verify/token-bucket.ts drives the real createAdapterRateLimiter (injected clock) and the real createEmailSpamGate: decisive output 'Arm A (50 s cadence): denied 10/20 - rate 1.2/min vs cap 10/min', 'Arm A last denial retryAfterMs = 10000 (true wait = full refillMs = 60000)', control 'Arm B (60 s cadence): denied 0/20' (isolates the fractional-credit cause), end-to-end 'Arm C (spam gate): rejected 10/20'.

Impact: legitimate senders below one token per refill period are permanently locked out of the email bridge.

Fix: advance the anchor only by credited periods: gained = Math.floor(elapsed / refillMs); tokens = Math.min(cap, tokens + gained); if (gained > 0) lastRefillAt += gained * refillMs; compute retryAfter from the updated anchor.

Source: .tmp/glm-review/deep-integrations-1015.md F-2 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
