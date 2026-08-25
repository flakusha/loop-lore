<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW `deleteUserData` hard-deletes `moderation_actions` rows — destroys auditability

**Status:** [OK] Resolved
**Severity:** Critical
**Priority:** critical
**Effort:** Small
**Area:** moderation, audit, security, privacy
**Epic:** epic-chat-lifecycle-moderation
**Tags:** moderation, audit, gdpr, admin-trust, data-retention
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `TASK-moderation-privacy-first-foundation.md` (privacy posture), `BUG-users-persona-handlers-horizontal-priv-esc.md` (separate admin-trust defect), `epic-nsfw-moderation-priority.md` (governing epic)

## Summary

`DELETE /api/nsfw/moderation/export/:userId` cascades hard-deletes every
`moderation_actions` row keyed by the target user. Any compromised or
malicious admin can quietly erase a victim's full action history
without leaving a record, defeating the purpose of the moderation audit
trail.

## Evidence

| File | Line | Action |
| --- | --- | --- |
| `src/routes/nsfw-moderation/audit.ts` | 41-50 | `DELETE /api/nsfw/moderation/export/:userId` calls `svc.deleteUserData(ctx.params.userId,)`. |
| `src/nsfw/moderation-service/data.ts` | 43-45 | `await thisL.db.deleteFrom("content_flags",).where("reporter_id","=",userId,).execute();` |
| `src/nsfw/moderation-service/data.ts` | 44-45 | `await thisL.db.deleteFrom("moderation_actions",).where("target_user_id","=",userId,).execute();` ← destructive |
| `src/nsfw/moderation-service/data.ts` | 45-46 | `await thisL.db.deleteFrom("nsfw_user_preferences",).where("user_id","=",userId,).execute();` |
| `src/db/migrations/008_moderation.ts` (schema) | — | `moderation_actions`: `target_user_id`, `action_type`, `performed_by`, `reason`, `metadata`, `created_at` — the canonical audit log. No `deleted_at` column. |

Authorization: `requireAdmin` (`src/routes/nsfw-moderation/shared.ts:18-25`)
≡ `can(ctx.userRole, "admin.system")`. ANY admin can erase ANY user's
moderation history.

## Impact

- **Audit-evasion**: A compromised admin can target a specific user and
  silently wipe every action ever taken against them (blocks, bans,
  shadows, appeals). Other admins see no inconsistency because the
  rows are simply gone.
- **GDPR hazard**: Even when invoked for legitimate GDPR right-to-erasure,
  the moderation audit log is an org-level security record, not user
  PII. Destroying it violates the operator's own retention policy and
  creates regulatory exposure if a victim later files a complaint.
- **Insider threat**: No `log_entries` row is written before the
  delete (`nsfw/moderation-service/data.ts:43-47` does not call any
  audit log). The action is invisible to the rest of the admin team.

## Fix

1. **Soft-delete, never hard-delete `moderation_actions`.**
   Add a migration introducing `moderation_actions.deleted_at INTEGER`
   and `moderation_actions.deleted_by TEXT` columns.
   `deleteUserData` becomes an `UPDATE … SET deleted_at = ?, deleted_by = ?`
   keyed on `target_user_id`. Reads (`getAuditLog`, `getUserAppeals`,
   the export bundle) filter with `where("deleted_at", "is", null)`.
2. **Hard-delete only `nsfw_user_preferences`** (a user-owned row, not
   an org record) — keep that branch.
3. **Hard-delete the reporter's own `content_flags`** (a reporter can
   retract their own flags) — keep that branch.
4. **Emit a `log_entries` row** before any destructive operation:
   `module: "nsfw-moderation", event_type: "moderation", action: "delete-user-data", user_id: ctx.userId, entity_id: targetUserId, meta: {tablesAffected: [...]}`. So an audit-aware admin can detect the action after the fact.
5. **Require dual-admin confirmation or capability > admin.system**
   (e.g. `admin.users`). Single admin should not be able to run this
   without a second pair of eyes.

## Verification

- Unit: `data.ts:deleteUserData` against a seeded user with 3
  `moderation_actions` rows. Assert rows remain (with `deleted_at`
  set) and `nsfw_user_preferences` row is gone.
- Integration: `DELETE /api/nsfw/moderation/export/:userId` returns
  200; subsequent `GET /api/nsfw/moderation/audit/:userId` returns
  empty array; `SELECT count(*) FROM moderation_actions WHERE
  target_user_id = ?` returns 3 (not 0); `log_entries` has a new
  `moderation/delete-user-data` row.
- Manual: confirm an admin who has not elevated to `admin.users`
  cannot call the endpoint (403).

## Acceptance Criteria

- [ ] Migration adds `deleted_at` + `deleted_by` columns to
      `moderation_actions`
- [ ] `deleteUserData` soft-deletes `moderation_actions`; preserves
      `content_flags`/`nsfw_user_preferences` hard-delete behavior
- [ ] `getAuditLog` / `getUserAppeals` / `exportUserData` filter out
      soft-deleted rows
- [ ] Every destructive action writes a `log_entries` audit row with
      admin id + target + tables affected
- [ ] Endpoint requires `admin.users` (not just `admin.system`) or
      dual-admin confirmation flow
- [ ] Tests cover: soft-delete preserves row, audit row written,
      capability check enforced, hard-delete still applies to prefs
- [ ] `bun run check` + `bun test src/nsfw/moderation-service/` green