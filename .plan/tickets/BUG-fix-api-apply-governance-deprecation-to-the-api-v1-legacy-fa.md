<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(api): apply governance + deprecation to the /api/v1 legacy fallback path

**Status:** Done
**Status Note:** [2026-10-28 triage refresh] FIXED (issue afe12b9 closed) — the previous note claiming the fallback "still dispatch[es] … with no governanceGuard" is stale. The governance guard exists since `3d19f888f`, and the double-charge it introduced on the versioned fallback has since been fixed (`1dde19c91`): `src/server/handler.ts:174-183` states "The governance guard is charged ONCE per HTTP request" and `govBefore(gctx)` is called at `:182` OUTSIDE the `dispatch` closure (`:185`), so the versioned fallback no longer burns a second token. The fallback also now resolves at both URL shapes — `:199-208` strips `/api/v1` and tries `pluginPathCandidates(stripped)`, and `:225-228` returns both `[stripped, withPrefix]` so `/api/card-battle/start` and `/api/v1/card-battle/start` both resolve (`9b96d9162`, `0f0101ae3`). Ticket stays Done.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-governance

**Summary:**

Sources: stream-a #3 (kept separate per instruction; cross-links: primary T02, related T01). Where: src/server/handler.ts:handleApiRequest (:146-155 strip-prefix fallback); src/routes/v1/index.ts:42-65 (guard + deprecation hooks). Gap: the strip-/api/v1-prefix fallback dispatches to legacy plugin routes outside the v1 barrel, so those responses skip governanceGuard rate limiting and deprecationAfterHandle headers entirely. Once T01/T04 move modules into the barrel the fallback shrinks, but any remaining fallback hit still ships a deprecated-but-unannounced, unthrottled v1 surface. Acceptance: fallback responses pass through the same guard/header logic as barrel responses, or fallback hits are tracked as migration debt with an observable counter/log. T02 deprecation expectations and T04 per-module decisions explicitly account for the fallback path. Priority: medium - same bypass class as T01 on a narrower path; keep open until T01/T04 land, then re-scope.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue afe12b9 (registry tip: cf805b555 Konstantin Fedotov Close issue)
