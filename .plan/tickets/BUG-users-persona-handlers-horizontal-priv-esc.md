<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: persona handlers missing role check — horizontal privilege escalation

**Status:** Not A Bug — Already Fixed
**Priority:** high
**Priority Tier:** P2
**Effort:** Small
**Area:** users/personas
**Source:** reconcile review (Scout Batch B — ISSUE-001)
**Resolved:** 2026-08-21

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
