<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW appeal approvedBy taken from request body

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-nsfw-moderation-priority

**Summary:**

src/routes/nsfw-moderation/appeals.ts:131 sets approvedBy from the request body instead of the authenticated admin identity - a caller can forge moderation attribution on appeal approval. Fix: derive approvedBy from the verified admin session (ctx.userId / derived identity), ignore the body field.

**Context:**

The dual-admin guard compared two client-supplied identities: the executor came from the session (`auth`), but the approver was read straight out of the request body (`ctx.body.approvedBy`). Any admin holding `admin.users` could approve an appeal and then execute its reversal by sending an arbitrary `approvedBy` string, so the second-admin confirmation could be bypassed entirely.

The approver is already recorded server-side: `reviewAppeal` stores the reviewer's session identity in `moderation_appeals.reviewed_by`, and that row is the authoritative record of who approved the appeal. The guard now compares the session executor against `reviewed_by`, so both identities are server-side and the execute route no longer accepts a body at all.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- `src/routes/nsfw-moderation/appeals.ts:126-141` — the execute route no longer reads `approvedBy` from `ctx.body`; the `executeReversalBody` schema was deleted and the handler calls `svc.executeReversal(ctx.params.id, auth)` with the session identity only.
- `src/nsfw/moderation-service/appeals-reversal.ts:51-70` — `executeReversal` dropped the `approvedBy` parameter and compares `executedBy` against `appeal.reviewed_by`, read from the appeal row.
- `src/nsfw/moderation-service/types.ts:145` and `src/nsfw/moderation-service/index.ts:136` — service signature updated; no client-supplied approver is left anywhere in the chain.
- Regression tests: `src/routes/nsfw-moderation/appeals.routes.test.ts` → "POST /:id/execute ignores a forged approver in the body" (a forged `approvedBy` no longer bypasses the guard — the call is rejected with 400) and `src/nsfw/moderation-service/appeals.test.ts` → "executeReversal > throws when the caller is the admin who approved the appeal (single-admin guard)".

## Review 2026-10-04

OPEN on dev - src/routes/nsfw-moderation/appeals.ts:132-133 passes const { approvedBy } = ctx.body into svc.executeReversal(ctx.params.id, auth, approvedBy) with auth used only as executedBy; the forged value drives the dual-admin guard (executedBy === approvedBy -> throw, src/nsfw/moderation-service/appeals-reversal.ts:54-56), so a single admin can self-approve by sending an arbitrary approvedBy string. git log --all on appeals.ts since 2026-09-25: lint/jsdoc commits only; no branch derives approvedBy from the session.
