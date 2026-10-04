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

## Review 2026-10-04

OPEN on dev - src/routes/nsfw-moderation/appeals.ts:132-133 passes const { approvedBy } = ctx.body into svc.executeReversal(ctx.params.id, auth, approvedBy) with auth used only as executedBy; the forged value drives the dual-admin guard (executedBy === approvedBy -> throw, src/nsfw/moderation-service/appeals-reversal.ts:54-56), so a single admin can self-approve by sending an arbitrary approvedBy string. git log --all on appeals.ts since 2026-09-25: lint/jsdoc commits only; no branch derives approvedBy from the session.
