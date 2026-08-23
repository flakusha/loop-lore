<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW `getPreferences` lazily INSERTs default row on miss — admin read materializes phantom row

**Status:** ⬜ Not Started
**Severity:** Medium
**Priority:** medium
**Effort:** Small
**Area:** moderation, nsfw, audit, data-integrity
**Epic:** epic-nsfw-moderation-priority
**Tags:** moderation, nsfw, side-effect, audit, data-integrity
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-nsfw-modactions-performedby-from-body.md` (same admin-read surface), `BUG-nsfw-moderation-delete-destroys-audit-log.md` (audit-destruction family)

## Summary

`GET /api/nsfw/moderation/preferences/:userId` calls
`getPreferences(userId)`. The service implements lazy create-on-miss:
if no `nsfw_user_preferences` row exists for the user, it INSERTs a
default row. The authorization gate is `requireOwnOrAdmin` — so an
admin reading a never-existed userId (or a freshly registered user
who has not touched NSFW settings) materializes a phantom row whose
`updated_at` differs from any other audit signal.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/nsfw/moderation-service/preferences.ts` | 18-52 | `getPreferences` — entire function |
| `src/nsfw/moderation-service/preferences.ts` | 19-25 | `selectFrom("nsfw_user_preferences").where("user_id","=",userId).selectAll()` — read first |
| `src/nsfw/moderation-service/preferences.ts` | 27-41 | On miss, lazy-INSERT with `access_status: "clear"`, `nsfw_enabled: false`, `max_rating: "sfw"`, `shadow_nsfw: 0`, `block_reason: null`, `updated_at: <now>` |
| `src/routes/nsfw-moderation/preferences.ts` | 24-35 | `GET /api/nsfw/moderation/preferences/:userId` — calls `svc.getPreferences(ctx.params.userId)`; `requireOwnOrAdmin` permits admin read |
| `src/routes/nsfw-moderation/shared.ts` | 28-35 | `requireOwnOrAdmin` — caller is self or `admin.system` |

Auth: `requireOwnOrAdmin(ctx, ctx.params.userId)` ≡ caller is self
OR has `admin.system`.

## Impact

- **Phantom-row creation by admin read**: an admin opening the
  moderation audit view (`nsfw-moderation.html`) for a user who
  never configured NSFW settings will silently create a row in
  `nsfw_user_preferences` with default values. The phantom row's
  `updated_at` is the time of the admin read, not the time of any
  real action — creates an audit signal that doesn't correspond to
  user intent.
- **Confuses downstream audit signals**: `block_reason = null`,
  `banned_at = null`, `banned_by = null`, but `updated_at` is set.
  Cross-referencing `moderation_actions` and
  `nsfw_user_preferences` to detect state changes becomes
  ambiguous.
- **Per-call write amplification**: every admin view of a
  never-configured user adds a write — combined with
  `getPreferences` being called from `mod-actions.ts:28,85` before
  state-machine transitions, this can amplify writes during
  block/ban flows.

## Fix

1. **Split `get` vs `getOrCreateOwn`**:

   ```ts
   function get(userId: string): Promise<NsfwUserPrefs | null>;
   function getOrCreateOwn(userId: string): Promise<NsfwUserPrefs>;
   ```

2. **Route handlers pick the right one**:
   - `GET /api/nsfw/moderation/preferences/:userId` → `get` (read
     only, returns 404 if missing).
   - `PUT /api/nsfw/moderation/preferences/:userId` (self only)
     → `getOrCreateOwn` (write semantics, OK to lazy-create).
   - Admin reads on another user's prefs should see `null`, not
     silently materialize.
3. **`mod-actions.ts:28,85`** — `blockUser` / `banUser` should
   `getOrCreateOwn` since they mutate the row anyway.
4. **Remove the existing lazy-create at
   `preferences.ts:27-41`** entirely. Replace with an explicit
   "prefs not found" return.
5. **Test**: admin reading a never-existed userId's prefs returns
   `null` (404); `nsfw_user_preferences` table has no new row;
   self-updating prefs still creates on first write.

## Verification

- Unit: `getPreferences("<never-existed>")` returns `null`
  (was `NsfwUserPrefs`); no row written. `getOrCreateOwn("<same>")`
  creates a row with default values.
- Integration: `GET /api/nsfw/moderation/preferences/<never-existed>`
  returns 404; admin cannot materialize a phantom row by reading.
  Self-call to `PUT` still creates on first write.
- Manual: as admin, GET prefs for an arbitrary UUID; confirm
  404, no DB write.

## Acceptance Criteria

- [ ] `getPreferences` split into `get` (read-only, no side
      effect) and `getOrCreateOwn` (write-semantics, lazy create)
- [ ] Route layer calls `get` for reads; only self-PUT uses
      `getOrCreateOwn`
- [ ] `mod-actions.ts` callers use `getOrCreateOwn`
- [ ] Test: admin read of non-existent user returns 404, no DB
      write
- [ ] Test: self-update still creates on first write
- [ ] `bun run check` + `bun test src/nsfw/moderation-service/preferences.test.ts` green