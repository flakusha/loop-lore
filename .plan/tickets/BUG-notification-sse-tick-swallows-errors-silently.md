<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Notification SSE tick swallows errors silently

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-frontend-notifications

**Summary:**

The notification SSE tick handler catches errors but does not log them, making debugging difficult. If the SSE stream errors, the client never knows and the server has no record. Fix: add structured logging in the error path before continuing.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
