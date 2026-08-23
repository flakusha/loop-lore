<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NSFW flag queue endpoint returns full `reporter_id` + free-text `description` to admin — no projection or redaction

**Status:** ⬜ Not Started
**Severity:** High
**Priority:** high
**Effort:** Small
**Area:** moderation, admin, privacy, pii
**Epic:** epic-nsfw-moderation-priority
**Tags:** moderation, admin, pii, flag-queue, reporter-identity
**Source:** OpenAgent admin/moderation direct-DB listing review (2026-08-23)
**Related:** `BUG-nsfw-modactions-performedby-from-body.md` (same admin trust surface), `BUG-nsfw-export-bundle-no-access-log.md` (same free-text description exposure), `BUG-nsfw-gate-log-plaintext-pii.md` (NSFW privacy family), `TEST-nsfw-getflagqueue-status-filter-untested.md` (test gap)

## Summary

`GET /api/nsfw/moderation/flags` returns `selectAll()` rows from
`content_flags` including the reporter's user ID, the reporter's
free-text description, the chat ID, the world ID, and the original
content ID. The same projection is used by the queue detail and the
flag-resolve response. No redaction or column stripping is applied.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/nsfw/moderation-service/flags.ts` | 26-34 | `flagContent` dup-check uses `selectAll()` — over-fetches the entire existing flag row when only `id` is needed |
| `src/nsfw/moderation-service/flags.ts` | 82-99 | `getFlagQueue` runs `selectAll()` and `mapFlag()` projects every column back to the route |
| `src/nsfw/moderation-service/flags.ts` | 110-120 | `resolveFlag` re-`selectAll()` and returns the whole row including `description` + `reporter_id` to the admin on every resolution |
| `src/nsfw/moderation-service/flags.ts` | 123-155 | `mapFlag` projects `reporterId` + `description` to the wire format |
| `src/routes/nsfw-moderation/flags.ts` | 38-50 | `GET /api/nsfw/moderation/flags` route calls `getFlagQueue` directly |
| `src/routes/nsfw-moderation/flags.ts` | 51-65 | `PUT /api/nsfw/moderation/flags/:id` returns the full flag via `resolveFlag` |

The admin-only authorization (`requireAdmin` at
`src/routes/nsfw-moderation/shared.ts:18-25`) is correct, but the
projection is over-broad for the queue use case. Any admin compromise
exposes who reported what.

## Impact

- **Reporter deanonymization**: the flag-queue listing carries
  `reporter_id` for every flag. If admin views leak (XSS, browser
  cache, network capture), a malicious actor can build a map of
  "who reported what" — a serious safety concern in NSFW contexts
  where reporters may face retaliation.
- **Free-text PII in description**: reporters may include context
  (e.g. "this character says X to my daughter who is a user I
  invited"). The free-text field travels to admin verbatim and
  persists in DB.
- **Pagination absent**: `getFlagQueue` accepts `limit` + `offset`
  from query string with no server-side cap. A admin client can
  page through the entire historical flag set unbounded.
- **No redaction for non-trust-admin roles**: `admin.system` is the
  only check. A viewer role (e.g. community manager) cannot be
  granted flag review without also gaining raw reporter identity.

## Fix

1. **Project to a `FlagQueueView` type** in
   `src/nsfw/moderation-service/flags.ts`:
   ```ts
   type FlagQueueView = Omit<ContentFlag,
     "reporterId" | "description" | "chatId" | "worldId" | "contentId">;
   ```
   `getFlagQueue` returns `FlagQueueView[]`. `description` is
   loaded only on explicit single-flag detail (new
   `GET /api/nsfw/moderation/flags/:id`).
2. **Hash `reporterId` to a stable opaque token** for the queue
   projection. The token is derived server-side (HMAC with a
   rotating secret) so the admin can still correlate repeat
   reporters across flags without seeing raw user IDs.
3. **Cap `limit` at 100 server-side** (override any client value).
4. **Default `status` to `pending`** when query param missing;
   reject unknown statuses at the schema layer.
5. **`resolveFlag` returns a minimal projection**:
   `{ id, status, resolution, resolvedBy, resolvedAt }` — no
   `reporterId`, no `description`, no `chatId`.
6. **Add a length cap on `description`** at flag creation
   (`flagContent`): reject if > 1000 chars; encourage structured
   `flagReason` enum over free-text.

## Verification

- Unit: `getFlagQueue` against seeded `content_flags` returns
  `FlagQueueView[]` with no `reporterId` / `description` fields;
  `description` field is null/absent in projection.
- Integration: admin client GETs
  `/api/nsfw/moderation/flags?status=pending&limit=200` → 200,
  capped to 100 rows; `reporterId` is replaced by `reporterHash`.
  Single-flag detail GET returns `description`.
- Manual: as admin, open DevTools → Network, hit the endpoint,
  confirm no raw `reporter_id` in response body.

## Acceptance Criteria

- [ ] `getFlagQueue` returns `FlagQueueView[]`; no `reporterId`,
      `description`, `chatId`, `worldId`, `contentId` columns in
      the wire response
- [ ] `reporterId` replaced by a stable `reporterHash` token
      (HMAC-derived)
- [ ] `limit` capped server-side at 100
- [ ] New `GET /api/nsfw/moderation/flags/:id` returns the full
      flag (with `description`) for single-detail context
- [ ] `resolveFlag` returns minimal
      `{ id, status, resolution, resolvedBy, resolvedAt }`
- [ ] `description` length-capped at 1000 chars on flag creation
- [ ] Tests cover projection redaction, limit cap, hash derivation
- [ ] `bun run check` + `bun test src/nsfw/moderation-service/flags.test.ts` green