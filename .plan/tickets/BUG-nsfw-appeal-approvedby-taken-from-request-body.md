<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: NSFW appeal approvedBy taken from request body

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

src/routes/nsfw-moderation/appeals.ts:131 sets approvedBy from the request body instead of the authenticated admin identity - a caller can forge moderation attribution on appeal approval. Fix: derive approvedBy from the verified admin session (ctx.userId / derived identity), ignore the body field.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
