<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: admin-audit pagination uses || 1, so an empty result set reports one page

**Status:** Not Started
**Priority:** Low
**Effort:** Medium
**Epic:** epic-frontend-admin

**Summary:**

Math.ceil(total / pageSize) || 1 returns 1 whenever the computed value is 0, i.e. whenever auditTotal is 0. The pager then renders a single page for an empty result set.

Evidence read on dev:

- src/frontend/alpine/admin-audit.ts:45-47 — get auditPages(): number { return Math.ceil(this.auditTotal / (this as any).pageSize) || 1; }

The same shape appears in the admin-chats, admin-users and admin-worlds modules.

Fix: Math.max(1, Math.ceil(...)) rather than the || default, and drop the (this as any).pageSize cast while in the file.

Source: .tmp/longcat/review-consolidated.md nit 27; .tmp/cat-jam/review-quality.md P3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
