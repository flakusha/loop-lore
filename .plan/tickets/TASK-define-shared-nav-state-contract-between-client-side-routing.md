<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Define shared nav-state contract between client-side routing and headers/navigation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-routing

**Summary:**

epic-frontend-routing and epic-frontend-headers-management both reference each other in their Integration Points sections (each names the other as a dependency), but no shared nav-state contract is defined. src/views/layout.html renders nav-item links with no aria-current/active binding to the current route; src/components/header.html carries a data-breadcrumb attribute but no active-link state. Define the single nav-state contract (active link, breadcrumb, history) shared by RTG and HDR.

**Context:**

Both epics are unscoped stubs. The route table (RTG) and the header/nav active-state (HDR) are one contract: active link, breadcrumb, and htmx-history. Today `src/views/layout.html` renders `nav-item` links with no `aria-current`/active binding to the current route, and `src/components/header.html` carries a `data-breadcrumb` attribute but no active-link state. No ticket tracks the shared contract; the reconcile tickets (TASK-reconcile-epic-frontend-routing-..., TASK-reconcile-epic-frontend-headers-...) verify each epic in isolation.

**Acceptance Criteria:**

- [ ] A single nav-state contract is defined (active link, breadcrumb, htmx-history) and referenced by both epics.
- [ ] `src/views/layout.html` marks the current route's nav item active (e.g. `aria-current="page"`) on htmx swaps.
- [ ] `src/components/header.html` derives its breadcrumb/title from the same nav-state source.
- [ ] `bun run plan:validate` passes; both epics cite the contract.

**Git Issue:** 02d5d23
