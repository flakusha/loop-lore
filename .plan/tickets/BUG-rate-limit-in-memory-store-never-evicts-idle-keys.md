<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: rate limit in-memory store never evicts idle keys

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Resolved:** 2026-09-26 — landed in c860a74b2. Verified by `src/api-governance/rate-limiting/store.test.ts` (sweep-after-1024-saves) and `src/api-governance/rate-limiting/store.ts:103-113` (maybeSweep). Ticket flagged stale.

**Summary:** InMemoryRateLimitStore (src/api-governance/rate-limiting/store.ts:27-30) keeps windows and buckets Maps keyed per user+policy with no eviction or prune, unlike middleware/rate-limit.ts which prunes; unbounded memory growth under churn. Fix: prune stale windows lazily on access plus a bounded periodic sweep. Verify: unit test inserting many keys and asserting map size stays bounded.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [x] Implementation complete (c860a74b2; lazy-on-access + maybeSweep at SWEEP_INTERVAL=1024)
- [x] Tests passing (`src/api-governance/rate-limiting/store.test.ts`)
- [x] Verification command from ticket executed green
