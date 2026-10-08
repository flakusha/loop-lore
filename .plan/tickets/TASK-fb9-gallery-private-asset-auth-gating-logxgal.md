<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: FB9 gallery private-asset auth gating (LOGxGAL)

**Status:** Not Started
**Priority:** high
**Effort:** Small

**Summary:**

**Status:** Not Started
**Priority:** high
**Effort:** S (route and view guard plus test)
**Summary:** Enforce auth gating for private gallery assets at the gallery route and view layer: anonymous and unauthorized requests for private assets are denied in the gallery route and view instead of relying on downstream checks.
**Context:** Source row matrix-frontend-backend-integration.md FB9 (LOGxGAL: private gallery assets require auth). Filed from 05-prioritization.md section 4 Now. R05 F2 upholds the now band (score 5, V3/E1/R2/U1); R05 F4 spot-check found only bug-fix and audit tickets on existing gates (BUG-gallery-grid-exposes-other-users-private-assets, Done), so no epic-linkage ticket exists. Files per R05 F2: src/routes/views/gallery.ts and src/views/gallery.html. Dedup: grepped index.json for gallery-search, visibility-filter, private-assets, gallery-grid-exposes; only prior bug fixes, no covering ticket.
**Acceptance Criteria:**
- Private gallery assets require auth at the route and view layer; anonymous requests get 401 or redirect, never asset bytes.
- Authenticated cross-user access to another users private assets is denied.
- Route-level regression tests cover anonymous, owner, and cross-user cases.
- bun run check green.
**Related:** 05-prioritization.md Now, R05 F2 and F4, BUG-gallery-grid-exposes-other-users-private-assets (prior fix, distinct).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
