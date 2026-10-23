<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Per-sender rate-limiter buckets are never evicted (unbounded memory keyed on forged senders)

**Status:** Done
**Status Note:** fixed on this branch — the shared adapter rate limiter now caps the tracked bucket map (`maxBuckets`, default 4096) and evicts the least-recently-used bucket once the cap is exceeded, so forged senders can no longer grow the map without bound (`src/integrations/health.ts:176-256`). Regression test in src/integrations/health.test.ts ("evicts the least-recently-used bucket once the tracked-bucket cap is exceeded").
**Priority:** medium
**Effort:** Small
**Epic:** epic-api-rate-limiting
**Related:** `epic-runtime-memory-state-hygiene.md` (cross-cutting unbounded-state class), `BUG-rate-limit-in-memory-store-never-evicts-idle-keys.md` (Done sibling)
**Tags:** integrations

**Summary:**

The bucket Map in src/integrations/health.ts:215-229 is only cleared by reset(), which has no production caller (src/integrations/email/spam-gate.ts:169 exposes it for tests). The email spam gate creates one bucket per unique lowercased From (spam-gate.ts:110-130) and inbound From is unauthenticated internet data. Reproduced: F3 heap growth after 200k unique forged senders: 19.5 MB (buckets never evicted) via .tmp/verify-concerns.ts. Each fresh sender also starts with a full bucket, so address rotation sidesteps the per-sender rate limit itself. The bridge dedup map has DEDUP_SWEEP_THRESHOLD (bridge.ts:89,180); this limiter has no analogue. Distinct from BUG-rate-limit-in-memory-store-never-evicts-idle-keys (Done) which covered src/api-governance/rate-limiting/store.ts. Fix: sweep idle buckets once the map crosses a size threshold (mirror the bridge sweep); optionally add a coarse global inbound budget so rotation cannot bypass limiting.

**Context:**

The spam gate creates one bucket per unique lowercased `From` address (`src/integrations/email/spam-gate.ts:110-130`) and that address is unauthenticated internet input, so the limiter map grew without bound and every fresh sender also started with a full budget. The sibling store bug (BUG-rate-limit-in-memory-store-never-evicts-idle-keys) was fixed in `src/api-governance/rate-limiting/store.ts`; this is a different map and needed its own bound. The fix belongs in the shared limiter (`createAdapterRateLimiter`) so every caller is bounded, not in the spam-gate call site. Alternatives considered: a TTL sweep (needs a per-call clock sweep) and a full LRU order (extra bookkeeping); a bounded LRU-style eviction is the smallest change that bounds memory. Trade-off: an evicted target gets a fresh budget — noted in a `ponytail:` comment next to the eviction helper.

**Acceptance Criteria:**

- [x] The shared adapter rate limiter bounds the number of tracked buckets (default cap 4096, overridable via the `maxBuckets` option)
- [x] Exceeding the cap evicts the least-recently-used bucket instead of growing the map
- [x] Regression test proves the cap is enforced (fails before the fix, passes after)
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- Root cause: the bucket map in `createAdapterRateLimiter` was only ever cleared by `reset()`, which has no production caller, so every unique target key stayed resident for the process lifetime.
- Changed `src/integrations/health.ts:176` (`DEFAULT_MAX_BUCKETS`), `:193` (`maxBuckets` option), `:224` (resolved cap), `:240` (evict on insert), `:248` (`evictOverflow()` helper).
- Regression test: `src/integrations/health.test.ts` — "evicts the least-recently-used bucket once the tracked-bucket cap is exceeded" (11 pass / 1 fail before the fix, 12 pass / 0 fail after).
