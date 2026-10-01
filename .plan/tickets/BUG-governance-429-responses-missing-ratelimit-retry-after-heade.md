<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: governance 429 responses missing RateLimit Retry-After headers

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-rate-limiting.md
**Tags:** api-rate-limiting
**Resolved:** 2026-09-26 — landed in c860a74b2 (fix: resolve 13 week-review BUG tickets). Verified by `src/routes/v1/governance.test.ts:55-71` ("throttled request carries standard RateLimit headers"). Ticket flagged stale (filed 2026-09-26 after the fix had already merged on the same day).

**Summary:** Governance 429s do not set RateLimit / RateLimit-Remaining / Retry-After headers although policies.ts:13 documents the name as surfaced in RateLimit headers and the status endpoint. Clients cannot back off. Fix: set standard headers on throttle responses from the matched policy. Verify: unit test asserting headers on a throttled request.
**Context:** Found 2026-09-26 during orchestrated strict review of dev commits 2026-09-19..26; finding verified directly in code before filing.
**Acceptance Criteria:**
- [x] Implementation complete (c860a74b2)
- [x] Tests passing (`src/routes/v1/governance.test.ts:55-71`)
- [x] Verification command from ticket executed green
