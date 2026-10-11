<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Notification bell visible on login/register pages

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

The notification bell (src/views/layout.html:253) is rendered on every page using layout.html, including /login and /register. On these pages the bell serves no purpose and may confuse unauthenticated users. Impact: Minor UX issue — unauthenticated users see a non-functional notification bell. Fix: Conditionally render the bell only when authenticated.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
