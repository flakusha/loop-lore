<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: export-sse job Map never evicted; completed ZIP buffers retained forever

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

export-sse job Map is never evicted; completed full-account ZIP buffers are retained in memory forever.

**Files:**

- src/routes/export-sse/jobs.ts:21-22 (`const jobs = new Map<string, ExportJob>()`, comment: "In-memory job store (in production, use Redis or DB)")
- src/routes/export-sse/start.ts:62 (`jobs.set` on every POST)
- src/routes/export-sse/types.ts:20 (`zipBuffer?: Buffer` retained after completion)

**Evidence:**

- No `jobs.delete` exists in any production file — grep finds deletes only in `jobs.coverage.test.ts` (review-surfaces.md S-4).
- Every `POST /api/v1/export/progress` (auth-gated only) zips the caller's entire account (chats/characters/worlds/assets/story) into memory and keeps the buffer in the Map forever; rate budget is `defaultPolicy` 300/min (`policyForRoute("/api/v1/export/progress")` matches no rule). A single user looping this OOMs the single-process server; ordinary use leaks one full-export buffer per click. A per-route limiter pattern already exists in-tree (`exportLimiter`, src/routes/settings.ts:25).

**Fix:**

Evict jobs on SSE completion + a timeout sweeper; stop retaining `zipBuffer` after completion; add a route-specific rate rule for `/api/v1/export/progress`.

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — review-surfaces.md S-4.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue ed44995 (registry tip: f0674ef63 Konstantin Fedotov Close issue)
