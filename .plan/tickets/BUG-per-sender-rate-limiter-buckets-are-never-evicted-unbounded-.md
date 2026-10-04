<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Per-sender rate-limiter buckets are never evicted (unbounded memory keyed on forged senders)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Tags:** integrations

**Summary:**

The bucket Map in src/integrations/health.ts:215-229 is only cleared by reset(), which has no production caller (src/integrations/email/spam-gate.ts:169 exposes it for tests). The email spam gate creates one bucket per unique lowercased From (spam-gate.ts:110-130) and inbound From is unauthenticated internet data. Reproduced: F3 heap growth after 200k unique forged senders: 19.5 MB (buckets never evicted) via .tmp/verify-concerns.ts. Each fresh sender also starts with a full bucket, so address rotation sidesteps the per-sender rate limit itself. The bridge dedup map has DEDUP_SWEEP_THRESHOLD (bridge.ts:89,180); this limiter has no analogue. Distinct from BUG-rate-limit-in-memory-store-never-evicts-idle-keys (Done) which covered src/api-governance/rate-limiting/store.ts. Fix: sweep idle buckets once the map crosses a size threshold (mirror the bridge sweep); optionally add a coarse global inbound budget so rotation cannot bypass limiting.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
