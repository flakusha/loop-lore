<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: persona handlers missing role check — horizontal privilege escalation

**Status:** ✅ Closed (2026-08-22, verified on `dev`)
**Priority:** high
**Priority Tier:** P2
**Effort:** Small
**Area:** users/personas
**Source:** reconcile review (Scout Batch B — ISSUE-001)
**Resolved:** 2026-08-21 (analysis) / 2026-08-22 (verification on `dev`)

## Verification (2026-08-22, `dev` @ 0e31e903)

`bun run check` passes 21/21. Service-layer `WHERE user_id = ?` enforcement on
`getById` / `update` / `delete` / `convertToCharacter` returns 404 (not 200) for
cross-user access — no horizontal privilege escalation possible. The
accompanying e2e gap (`TEST-e2e-users-personas-routes-missing.md`) documents the
missing regression test, not a live defect.

## Resolution

The authz is enforced at the **service layer** via SQL `WHERE user_id = ?` clauses,
not at the handler layer. Each service method receives `userId` and includes it in
queries. No cross-user access is possible.

| Handler | Service method | Authz mechanism |
|---|---|---|
| `handleGetPersona` | `service.getById(id, userId)` | `WHERE id=? AND user_id=?` |
| `handleUpdatePersona` | `service.update(id, params, userId)` | `WHERE id=? AND user_id=?` |
| `handleDeletePersona` | `service.delete(id, userId)` | `WHERE id=? AND user_id=?` |
| `handleConvertToCharacter` | `service.convertToCharacter(id, userId)` | `SELECT … WHERE id=? AND user_id=?` |

If the persona does not belong to the user, the query returns `undefined`/`null`
and the handler returns 404 — not 200 with another user's data. No privilege
escalation is possible.
