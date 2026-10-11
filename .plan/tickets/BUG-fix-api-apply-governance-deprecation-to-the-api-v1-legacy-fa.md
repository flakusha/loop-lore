<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: fix(api): apply governance + deprecation to the /api/v1 legacy fallback path

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** routing-versioning-consolidation

**Summary:**

Sources: stream-a #3 (kept separate per instruction; cross-links: primary T02, related T01). Where: src/server/handler.ts:handleApiRequest (:146-155 strip-prefix fallback); src/routes/v1/index.ts:42-65 (guard + deprecation hooks). Gap: the strip-/api/v1-prefix fallback dispatches to legacy plugin routes outside the v1 barrel, so those responses skip governanceGuard rate limiting and deprecationAfterHandle headers entirely. Once T01/T04 move modules into the barrel the fallback shrinks, but any remaining fallback hit still ships a deprecated-but-unannounced, unthrottled v1 surface. Acceptance: fallback responses pass through the same guard/header logic as barrel responses, or fallback hits are tracked as migration debt with an observable counter/log. T02 deprecation expectations and T04 per-module decisions explicitly account for the fallback path. Priority: medium - same bypass class as T01 on a narrower path; keep open until T01/T04 land, then re-scope.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
