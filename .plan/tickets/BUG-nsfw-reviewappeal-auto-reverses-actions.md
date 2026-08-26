<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `reviewAppeal` auto-reverses `block`/`ban`/`shadow` on a single admin's approval — no separate confirmation

**Status:** Done
**Severity:** High
**Priority:** high
**Effort:** Small
**Area:** moderation, audit, admin-trust
**Epic:** epic-nsfw-moderation-priority
**Tags:** moderation, appeal, audit, two-phase-commit, admin-trust
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-nsfw-modactions-performedby-from-body.md` (same admin-trust surface), `BUG-nsfw-appeals-as-any-and-dead-route.md` (same appeals service), `BUG-nsfw-moderation-delete-destroys-audit-log.md` (audit-destruction family)

## Summary

When an admin calls `reviewAppeal(... , status: "approved")`, the
moderation service silently invokes `unblockUser` / `unbanUser` /
`unshadowUser` against the original target. The original action row
is preserved but the new "reversal" is wired through without any
second-pair-of-eyes confirmation, no elevated capability check, and
no supersede-marker on the original action.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/nsfw/moderation-service/appeals.ts` | 115-148 | `reviewAppeal` runs the approval branch |
| `src/nsfw/moderation-service/appeals.ts` | 125-145 | Reads `action_id` + `action_type` + `target_user_id` from `moderation_actions`, then dispatches |
| `src/nsfw/moderation-service/appeals.ts` | 136-142 | Calls `unblockUser` / `unbanUser` / `unshadowUser` synchronously with `"Appeal approved"` as the reason |
| `src/nsfw/moderation-service/appeals.ts` | 132 | `select(["action_type", "target_user_id",])` — reads only those two columns, OK |
| `src/nsfw/moderation-service/appeals.ts` | (no route) | Service is unwired (see `BUG-nsfw-appeals-as-any-and-dead-route.md`); when wired this defect activates |

Auth at the (eventual) route: `requireAdmin(ctx)` ≡
`can(ctx.userRole, "admin.system")` — same as every other NSFW mod
action. No capability bump, no second-admin check, no confirmation
token.

## Impact

- **Single-admin irreversible decision**: a single admin can
  reverse a previous admin's `ban`/`shadow`/`block` via appeal
  approval without corroboration. This undermines the
  multi-admin-trust model that the moderation system otherwise
  assumes.
- **Original action is not preserved as `superseded_by`**: the
  original `moderation_actions` row stays untouched in the log, but
  its effective state is silently reversed via the new
  `unbanUser`/`unblockUser`/`unshadowUser` `recordAction`. Auditors
  reading the timeline see two actions (block, unblock) with no
  indication they were coupled via an appeal.
- **No notification to original actor**: the admin who took the
  original ban/shadow receives no alert that it has been reversed
  through an appeal.
- **`"Appeal approved"` as a reason** (`appeals.ts:137-139`) is a
  canned string; the actual `reviewNote` (also passed in) is
  dropped on the floor — the reversal `recordAction` does not
  carry the reviewer's note.

## Fix

1. **Two-phase commit**: `reviewAppeal(..., status: "approved")`
   records a `pending_reversal` action with
   `metadata: { appealId, reversalOf: <action-id>, reviewNote }`.
   The reversal is NOT executed. A second admin (different `userId`
   from the reviewer) must explicitly call `executeReversal(appealId)`
   to apply the unblock/unban/unshadow.
2. **Original-action supersede marker**: add a `superseded_by TEXT`
   column to `moderation_actions`. When the reversal executes, set
   `superseded_by` on the original action. `getAuditLog` should
   return a `supersededBy` field per row.
3. **Capability bump**: require `admin.users` (not just
   `admin.system`) on both `reviewAppeal(approved)` AND
   `executeReversal`. Document the rationale.
4. **Notify the original moderator**: emit a `notifications` row
   addressed to the admin who took the original action:
   "Your <action_type> on <target_user_id> was reversed via appeal
   <appeal_id> by <reviewer>". Use the existing notification table.
5. **Carry `reviewNote`**: pass `reviewNote` through
   `recordAction`'s `metadata` so the reversal row records WHY.
6. **Audit log**: emit a `log_entries` row on both the approval
   AND the execution (separate rows).

## Verification

- Unit: `reviewAppeal` with `status: "approved"` produces a
  `pending_reversal` row, NO direct state change in
  `nsfw_user_preferences`. `executeReversal(appealId)` by a
  different admin applies the reversal.
- Integration: admin-A reverses admin-B's ban via approval. Confirm
  no unban-side-effect yet. Admin-C executes reversal. Confirm
  `nsfw_user_preferences.access_status` flips to `clear` AND the
  original `moderation_actions` row's `superseded_by` points to
  the new row's id.
- Manual: as admin, attempt to approve an appeal; confirm the
  state does not change until a second admin executes the reversal.

## Acceptance Criteria

- [ ] Migration adds `moderation_actions.superseded_by TEXT`
- [ ] `reviewAppeal(approved)` records `pending_reversal`
      `recordAction`, no direct state change
- [ ] New `executeReversal(appealId)` route requires `admin.users`
      and a different `ctx.userId` than the approver
- [ ] Original moderator receives a `notifications` row on reversal
- [ ] `reviewNote` carried through `recordAction.metadata` on the
      reversal row
- [ ] Both approval AND execution emit `log_entries` rows
- [ ] Tests: pending → execution flow, capability check, original
      admin notification
- [ ] `bun run check` + `bun test src/nsfw/moderation-service/appeals.test.ts` green