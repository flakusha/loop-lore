<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW mod actions (`block/unblock/ban/unban/shadow/unshadow`) trust `performedBy` from request body — admin impersonation

**Status:** ⬜ Not Started
**Severity:** High
**Priority:** high
**Effort:** Small
**Area:** moderation, admin, security, audit
**Epic:** epic-nsfw-moderation-priority
**Tags:** moderation, admin-trust, audit, impersonation, authz
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-impersonate-commands-register-empty-callback.md` (separate impersonation ticket, distinct surface), `BUG-nsfw-moderation-delete-destroys-audit-log.md` (same audit-trust surface), `TASK-moderation-privacy-first-foundation.md` (governing ticket)

## Summary

All six NSFW moderation endpoints (`block/unblock/ban/unban/shadow/unshadow`)
accept `performedBy` in the request body and persist it verbatim into
`moderation_actions.performed_by` (`src/nsfw/moderation-service/audit.ts:33`).
The server-side auth context (`ctx.userId`) is never consulted. Any
authenticated admin can claim another admin's identity in the audit log.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/routes/nsfw-moderation/actions.ts` | 20-30 | `POST /api/nsfw/moderation/block` accepts `performedBy` from `ctx.body.performedBy` |
| `src/routes/nsfw-moderation/actions.ts` | 31-41 | `POST /api/nsfw/moderation/unblock` — same pattern |
| `src/routes/nsfw-moderation/actions.ts` | 42-52 | `POST /api/nsfw/moderation/ban` — same |
| `src/routes/nsfw-moderation/actions.ts` | 53-63 | `POST /api/nsfw/moderation/unban` — same |
| `src/routes/nsfw-moderation/actions.ts` | 64-74 | `POST /api/nsfw/moderation/shadow` — same |
| `src/routes/nsfw-moderation/actions.ts` | 75-85 | `POST /api/nsfw/moderation/unshadow` — same |
| `src/nsfw/moderation-service/mod-actions.ts` | 25-46 | `blockUser({ performedBy, ... })` — uses body field directly |
| `src/nsfw/moderation-service/mod-actions.ts` | 56-72 | `unblockUser` — same |
| `src/nsfw/moderation-service/mod-actions.ts` | 82-97 | `banUser` — same |
| `src/nsfw/moderation-service/mod-actions.ts` | 107-125 | `unbanUser` — same |
| `src/nsfw/moderation-service/mod-actions.ts` | 135-151 | `shadowUser` — same |
| `src/nsfw/moderation-service/mod-actions.ts` | 161-179 | `unshadowUser` — same |
| `src/nsfw/moderation-service/audit.ts` | 28-39 | `recordAction` writes `performed_by: params.performedBy` to `moderation_actions` |

Auth at the route layer: `requireAdmin(ctx)` (≡ `can(ctx.userRole,
"admin.system")`) ✓ — but admin role alone doesn't constrain `performedBy`.

## Impact

- **Admin impersonation in the audit log**: Admin A blocks User X
  but sets `performedBy = "admin-b"` in the body. The audit log
  shows admin B did it; admin B has no record of the action.
- **Discrediting / framing**: malicious admin can attribute
  controversial decisions (bans) to a colleague, creating plausible
  deniability for themselves and reputational harm to the named
  admin.
- **Forensic obstruction**: an after-the-fact incident review
  cannot reconstruct who actually took the action.
- **No `user_id` parameter naming mismatch**: `ctx.userId` (server
  truth) is available; the route just ignores it.

## Fix

1. **Strip `performedBy` from the body schemas** at the route layer
   (`src/routes/nsfw-moderation/shared.ts:43-52`):
   ```ts
   export const blockBody = t.Object({
     targetUserId: t.String(),
     reason: t.String(),
     // performedBy removed
     },);
   ```
2. **Derive `performedBy` server-side**: change all six
   `mod-actions.ts` functions to accept `performedBy: string` from
   the route — pass `ctx.userId` (server-trusted). Update the
   service-layer signatures to make `performedBy` a required
   string the route MUST supply.
3. **Reject `ctx.body.performedBy` if supplied** (defense in depth):
   return 400 on unexpected keys; prevents silent drift.
4. **Add regression test**: Admin A blocks User X with body
   `{targetUserId: "x", performedBy: "admin-b", reason: "test"}`.
   Assert: response 400; `moderation_actions.performed_by` for the
   new row equals Admin A's id, not admin-b.

## Verification

- Unit: `actions.ts:20-30` body validation rejects unexpected
  `performedBy` key. `recordAction` is invoked with
  `performedBy === ctx.userId` regardless of what the body contains.
- Integration: seed two admin users, have admin-A call
  `POST /api/nsfw/moderation/block` with
  `performedBy: "<admin-B-id>"` → 400. Same call without
  `performedBy` → 200, row's `performed_by` = admin-A-id.
- Manual: as admin, open DevTools → Network, send a forged
  `performedBy` in the body. Confirm 400 and that the audit
  row's `performed_by` column holds the requester's id.

## Acceptance Criteria

- [ ] `blockBody` / `modBody` schemas in
      `src/routes/nsfw-moderation/shared.ts:43-52` drop the
      `performedBy` field
- [ ] All six `mod-actions.ts` service functions receive `performedBy`
      from the route, which sources it from `ctx.userId`
- [ ] Unexpected `performedBy` in the body returns 400 (defense in
      depth)
- [ ] Test: impersonation attempt returns 400; row's
      `performed_by` = caller's id, not claimed id
- [ ] No other caller (chat moderation, blog moderation) is using the
      same impersonable pattern
- [ ] `bun run check` + `bun test src/nsfw/moderation-service/` +
      `bun test src/routes/nsfw-moderation/` green