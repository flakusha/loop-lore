<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW `exportUserData` returns full GDPR bundle (prefs + audit + flags) with no access log, no rate limit, no elevated capability

**Status:** Done
**Severity:** Medium
**Priority:** medium
**Effort:** Small
**Area:** moderation, gdpr, audit, rate-limit
**Epic:** epic-nsfw-moderation-priority
**Tags:** moderation, gdpr, export, audit, rate-limit, admin-trust
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-nsfw-moderation-delete-destroys-audit-log.md` (same audit-trust surface — companion ticket, same surface area different verb), `BUG-nsfw-flagqueue-leaks-reporter-pii.md` (free-text description exposure), `TASK-moderation-privacy-first-foundation.md` (governing privacy ticket)

## Summary

`GET /api/nsfw/moderation/export/:userId` (`exportUserData`)
returns a GDPR export bundle: full `nsfw_user_preferences` row
(including `block_reason`, `banned_by`, `banned_at`), every
`moderation_actions` row for the user (free-text admin `reason`),
and every `content_flags` row the user has submitted (with
free-text `description`). Authorization is `requireAdmin` —
`admin.system` is the only capability required, no elevation.
There is no access log, no rate limit, and no download streaming —
the bundle is returned inline.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/routes/nsfw-moderation/audit.ts` | 31-40 | `GET /api/nsfw/moderation/export/:userId` route handler |
| `src/nsfw/moderation-service/data.ts` | 18-35 | `exportUserData` — entire function |
| `src/nsfw/moderation-service/data.ts` | 21-22 | `Promise.allSettled([getPreferences(userId), getAuditLog(userId),])` — full prefs + audit |
| `src/nsfw/moderation-service/data.ts` | 25-29 | `selectFrom("content_flags").where("reporter_id","=",userId).orderBy("created_at","desc").selectAll().execute()` — every flag the user submitted, including free-text `description` |
| `src/nsfw/moderation-service/audit.ts` | 71-78 | `getAuditLog` returns full `moderation_actions` rows including free-text `reason` and `metadata` (JSON-parsed) |
| `src/routes/nsfw-moderation/shared.ts` | 18-25 | `requireAdmin(ctx)` ≡ `can(ctx.userRole, "admin.system")` — only check |

Auth: `requireAdmin` (admin.system only). No `admin.users`
elevation. No rate limit. No access log. No confirmation token.

## Impact

- **High-sensitivity bundle, low barrier**: an admin who has
  `admin.system` can dump another user's full moderation record
  in a single GET — including the free-text reason strings the
  previous admin wrote. There is no record of who downloaded
  what, no rate limit (so a malicious admin could exfiltrate
  every user's data in seconds), and no two-person review.
- **Reporter identity linkage**: the bundle includes every flag
  the user has submitted, with the `chatId` and `worldId`
  columns. Cross-correlated with admin-only views, this reveals
  not just what the user reported, but in which chat/world —
  matching the same deanonymization surface as
  `BUG-nsfw-flagqueue-leaks-reporter-pii.md`.
- **GDPR hazard**: legitimate GDPR exports are subject to
  identity verification, retention policy, and audit log
  requirements. This implementation skips all of those.

## Fix

1. **Elevate the capability**: require `admin.users` (not
   `admin.system`). Document the rationale (PII surface).
2. **Emit a `log_entries` access-log row** before serving:

   ```ts
   await db.insertInto("log_entries").values({
     id: crypto.randomUUID(),
     module: "nsfw-moderation",
     event_type: "moderation",
     action: "export-user-data",
     user_id: ctx.userId,
     entity_id: targetUserId,
     level: 6,
     meta: jsonStringifyOr({ requesterIp: getClientIp(ctx), }),
     message: "GDPR export",
     created_at: new Date().toISOString(),
     time: new Date().toISOString(),
     timestamp: Date.now(),
     },).execute();
   ```

3. **Rate-limit the endpoint** at the middleware layer (e.g.
   10/hour per admin) — reuse `src/middleware/rate-limit.ts`.
4. **Stream the bundle to a signed URL** rather than returning
   it inline. Generate a one-time URL with TTL ≤ 5 min; the
   export is staged in a temp file (or stored in
   `audit_export_log` table) for the same TTL.
5. **Sanitize free-text fields** before bundling: replace
   `description` with a length-capped preview (`≤ 200 chars +
   "..."`) and `reason` with a length-capped preview. Full
   fields are redacted in the bundle; an admin can re-request
   the unredacted version via a separate endpoint with
   elevated capability.
6. **Identity verification gate**: confirm the requester has
   reason to access this specific user's data. Either a
   separate "approved export request" workflow or a
   `?reason=` parameter that is logged.
7. **Add `description` length cap** at flag creation (cross-cut
   with `BUG-nsfw-flagqueue-leaks-reporter-pii.md`).

## Verification

- Unit: `exportUserData(...)` writes a `log_entries` access-log
  row; bundle has sanitized `description`/`reason` previews;
  `exportAuditId` returned for re-requesting full fields.
- Integration: admin GET returns the access log row + bundle;
  rate limit kicks in after 10/hour; admin without
  `admin.users` → 403.
- Manual: as admin, trigger export, verify a `log_entries` row
  appears with admin id + target user id + timestamp.

## Acceptance Criteria

- [ ] Endpoint requires `admin.users` capability (not just
      `admin.system`)
- [ ] Access-log row written to `log_entries` before serving
- [ ] Rate limit at 10/hour per admin via existing middleware
- [ ] Bundle streams via signed URL with TTL ≤ 5 min
- [ ] Free-text fields (`description`, `reason`) length-capped
      with preview in default bundle; full fields require
      explicit second-step request
- [ ] Tests cover: capability check, access log, rate limit,
      signed-URL flow, sanitization
- [ ] `bun run check` + `bun test src/nsfw/moderation-service/data.test.ts` +
      `src/routes/nsfw-moderation/audit.test.ts` green