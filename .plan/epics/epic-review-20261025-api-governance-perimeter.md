<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: API Governance Perimeter (2026-10-25 review round E-1)

**Status:** In Progress
**Status Note:** Rate-limit items landed on epic-api-governance-perimeter: ai-action suffix rule (S-5) + dedicated outbound-fetch policy for link-preview (S-12) inserted above the /api/v1/chats prefix rule, which had also been shadowing the /story/step + /story/resume rules into dead code — rules reordered and now pinned by wiring tests through the real mounted surfaces (governance-integration + a new register-plugins wiring test). Guard scope aligned with the mount topology (S-6): registerPlugins wraps the root-mounted migrated surfaces (agency, location-explorer, game-state, story-orchestration, config-menu) in the same governanceGuard the v1 barrel uses. Export-sse (S-4): TTL+cap eviction pre-existed from the 2026-10-26 round; the zip buffer is now released on first download (one-shot delivery, discriminating test). Config-menu (S-7): FE+BE verified already on /api/v1; unversioned /api/config-menu pinned as 308 → /api/v1 in v1-enforcement.test. Remaining: finalize/merge (orchestrator).
**Priority:** High
**Effort:** Large
**Type:** Infrastructure Epic
**Tags:** api-governance, rate-limiting, mount-topology, versioning, review-2026-10-25

**Overview:** (see sections below)

## Summary

Align the governance guard scope with the actual mount topology; per-route budgets for expensive endpoints; export job lifecycle; config-menu into the versioned API. The policy table keeps accreting suffix rules for symptoms while the mount topology — what the guard can see at all — is the actual boundary (review-surfaces.md cluster 2).

Folds in B-10 (guard scoped to the v1 barrel; unversioned LLM routes unthrottled; dead /story/step + /story/resume rules) — deliberately not filed separately.

## Scope

1. Align guard scope with mount topology: story-orchestration, agency, memory-audit, location-explorer, config-menu are mounted on the root app outside the v1 barrel (src/app/register-plugins.ts:61-68), so the guard never runs on them (S-6).
2. Per-route budgets for expensive endpoints: export progress (S-4), ai-action (S-5, also filed standalone as BUG-ai-action-billable-llm-endpoint-classified-300-min-chatpolic), story LLM routes, link-preview fetch (S-12).
3. Export job lifecycle (eviction; see BUG-export-sse-job-map-never-evicted-completed-zip-buffers-retai).
4. Config-menu FE+BE into the versioned API (S-7; note closest non-overlap 8387b00 = config-menu preference reverts, different defect).
5. Remove dead policy rules (/story/step, /story/resume) once mounts are versioned or the guard covers them (S-6).

## Related Epics

- .plan/epics/epic-api-rate-limiting.md
- .plan/epics/epic-api-versioning.md

## Tickets

- Related git issues: 3f07a06, afe12b9, 2374b1c, 7d17b06 (mount topology + governance perimeter)
- Findings: S-4, S-5, S-6, S-7, S-12 in .tmp/reviews/2026-10-25/review-surfaces.md

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round).


git issue: 1d2d787
