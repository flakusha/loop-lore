<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: FB5 route transitions reuse central htmx swap lifecycle (RTGxDED)

**Status:** Not Started
**Priority:** medium
**Effort:** Small

**Summary:**

**Status:** Not Started
**Priority:** medium
**Effort:** S (routing swaps call shared helper plus test updates)
**Summary:** Routing-driven swaps call the shared AfterSwap to Alpine.initTree plus OOB path in htmx.ts instead of ad-hoc swap code per route.
**Context:** Source row matrix-frontend-backend-integration.md FB5 (RTG x DED). Filed from 02-extract-features.md candidate 2, R02 candidate 2 confirmed with caveat. Files: src/frontend/pages and src/frontend/alpine/htmx.ts (initTree call at htmx.ts:81). Dependency: ship before FB3 hub index; new hub pages must ride the central path. Dedup: grepped index.json for swap lifecycle, htmx swap, FB5; only EPIC-LLAMA-SWAP (unrelated domain) and a trade-offer ticket.
**Acceptance Criteria:**
- Routing-driven swaps route through the shared AfterSwap plus initTree and OOB path; no ad-hoc swap duplicates remain in covered pages.
- Route-level regression tests updated and passing.
- bun run check green.
**Related:** 02-extract-features.md candidate 2, R02 candidate 2, 05-prioritization.md Next FB4/FB5, FB3 hub index (dependent).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
