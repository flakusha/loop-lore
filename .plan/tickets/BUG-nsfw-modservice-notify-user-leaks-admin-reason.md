<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW `notifyUser` stores admin's verbatim `reason` as `notifications.body` — leaks internal case-detail text to user

**Status:** Done
**Severity:** Medium
**Priority:** medium
**Effort:** Trivial
**Area:** moderation, notifications, admin, privacy
**Epic:** epic-nsfw-moderation-priority
**Tags:** moderation, notifications, pii, internal-notes, admin
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-nsfw-modactions-performedby-from-body.md` (same admin-trust surface), `BUG-nsfw-moderation-delete-destroys-audit-log.md` (audit-trust family), `TASK-moderation-privacy-first-foundation.md` (privacy posture)

## Summary

`notifyUser` (`src/nsfw/moderation-service/audit.ts:82-107`) inserts
a row into `notifications` with `body: reason` — the admin's
free-text reason verbatim. The admin may have written internal
context (e.g. "third strike, prior warnings documented, escalated
per policy-team decision"), which is not appropriate for the
affected user to see.

The function already maintains a `titles: Record<string, string>`
map (`audit.ts:88-95`) for action-type-specific canned titles; the
body should follow the same pattern.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/nsfw/moderation-service/audit.ts` | 82-107 | `notifyUser` — entire function |
| `src/nsfw/moderation-service/audit.ts` | 88-95 | `titles: Record<string, string>` — canned titles already exist per `actionType` |
| `src/nsfw/moderation-service/audit.ts` | 97-106 | `await deps.db.insertInto("notifications",).values({...title, body: reason, ...})` — admin verbatim |
| `src/nsfw/moderation-service/audit.ts` | 42-48 | `recordAction` invocation site: passes `params.reason` as the `reason` argument to `notifyUser` |
| `src/nsfw/moderation-service/mod-actions.ts` | 25-46 | `blockUser({ performedBy, reason })` — reason flows from caller → recordAction → notifyUser |
| `src/db/migrations/023_notifications.ts` | (schema) | `notifications.body` — free-text column |

Auth: none on `notifyUser` itself; called from
`recordAction` which is called from the (admin-gated) mod-actions.

## Impact

- **Internal-context leak to user**: admin may include internal
  case-detail text (moderator identities, prior incident
  references, internal policy language) in `reason`. This text is
  now persisted in the user's `notifications.body` and surfaced
  on the user's notification bell.
- **Audit-log PII**: free-text `reason` from one admin can be
  quoted in another admin's future decisions, creating a
  PII-propagation chain.
- **GDPR hazard**: if the user later invokes right-to-erasure,
  the `notifications.body` would need redaction (vs. the existing
  `moderation_actions.reason` which the org retains for audit).

## Fix

1. **Replace `body: reason` with a canned `bodies: Record<string,
   string>` map** (mirror `titles`) at
   `src/nsfw/moderation-service/audit.ts:88-95`:

   ```ts
   const bodies: Record<string, string> = {
     block: "You can no longer interact with NSFW content.",
     unblock: "Your NSFW access has been restored.",
     ban: "You are banned from NSFW content.",
     unban: "Your NSFW ban has been lifted.",
     shadow: "Some of your NSFW interactions have been limited.",
     unshadow: "Your NSFW access restrictions have been lifted.",
     },
   ```

   For action types not in the map, fall back to a generic template.
2. **Optionally include a sanitized short reason** for the user
   only if the admin has explicitly marked it as `user_visible`
   in the body schema. Otherwise, default to the canned body.
3. **Persist the full admin `reason` only in
   `moderation_actions.reason`** (already the case via
   `recordAction`). The notification body and the audit reason
   have different audiences; they should not be the same string.
4. **Add a length cap on `notifications.body`** at the
   `notifications` schema level (≤ 500 chars) to prevent
   over-disclosure.
5. **Test**: `notifyUser(...)` with reason "internal case detail"
   → `notifications.body` = canned string, not "internal case
   detail".

## Verification

- Unit: `notifyUser(...)` with arbitrary `reason` writes canned
  body for known action types; unknown action types write generic
  fallback.
- Integration: `blockUser(...)` from the route; `SELECT body FROM
  notifications WHERE user_id = ?` returns canned text, not the
  admin's verbatim reason.
- Manual: as admin, block a user with reason "internal context";
  open the affected user's notification bell; confirm body shows
  canned text only.

## Acceptance Criteria

- [ ] `bodies: Record<string, string>` map mirrors `titles` at
      `audit.ts:88-95`
- [ ] `notifyUser` writes canned body, not admin verbatim
      `reason`
- [ ] `notifications.body` length capped at 500 chars (schema +
      insert)
- [ ] Optional: `user_visible: true` flag on the request allows
      short admin-supplied reason to surface to user (otherwise
      canned body only)
- [ ] Test: canned body used; admin reason preserved in
      `moderation_actions.reason` only
- [ ] `bun run check` + `bun test src/nsfw/moderation-service/audit.test.ts` green