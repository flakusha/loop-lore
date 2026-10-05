<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Character approval workflow not implemented

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Characters are created directly with no review step. The ReviewState enum (Draft/PendingReview/Approved/Rejected/Archived) exists in src/characters/spec/enums.ts but has no DB column, no route, no service, and no frontend. Need: review_state column on actors table, approval service, admin approval endpoints, frontend approval UI.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
