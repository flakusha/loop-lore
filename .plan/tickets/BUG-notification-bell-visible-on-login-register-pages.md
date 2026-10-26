<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Notification bell visible on login/register pages

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-frontend-notifications

**Summary:**

The notification bell (src/views/layout.html:253) is rendered on every page using layout.html, including /login and /register. On these pages the bell serves no purpose and may confuse unauthenticated users. Impact: Minor UX issue — unauthenticated users see a non-functional notification bell. Fix: Conditionally render the bell only when authenticated.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 64b4832 (registry tip: 273edc425 Konstantin Fedotov Close issue)
