---
hash: d4e7f91

git issue: b0e78c5


**Summary:** `getAuditLog` returns raw `ModAction[]` including `performedBy` (moderator identity) to every caller with `moderation.review`; no redaction layer exists.
**Context:** `src/routes/nsfw-moderation/audit.ts:29`; `src/nsfw/moderation-service/audit.ts:162-191` (`mapAction` projects full `ModAction`); `src/nsfw/moderation-service/types.ts:32-47`.
**Acceptance Criteria:** none — DOWNGRADED to design discussion (2026-09-24): inter-moderator transparency is an intentional, test-pinned design choice; the user-self-export exposure is speculative until a GDPR user-self route exists on this surface. Reclassify as IDEA/design-RFC if redaction is wanted.
**Priority:** n/a (design)
**Effort:** n/a (design)

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `getAuditLog` returns `performedBy` (moderator identity) to all callers with `moderation.review`

**Status:** done
**Severity:** n/a (design)
**Reason:** two claims — only one is a concrete defect:

1. Moderator→moderator visibility of `performedBy`: this is design choice, not a defect. Existing test `data.test.ts:225-240` confirms the export bundle includes `actions` with the full `ModAction` shape (no redaction). No internal redaction layer exists; the codebase treats inter-moderator transparency as a feature. If the team wants to redact, that is a design decision — not a bug. Should be tracked as IDEA/design-RFC if pursued.

2. User-self-export `performedBy` exposure: theoretical. `exportUserData` route in current scope is gated by `requireAdminUsers` (`routes/nsfw-moderation/audit.ts:35-47`), not user-self. A user-self GDPR route does not yet exist in this surface; the claim is speculative until one does. If/when that surface ships, this becomes a real defect.

Reclassify as IDEA-tracking the design intent (re-redact `performedBy` from non-admin surfaces) rather than BUG. No code change required at this time.

## Summary

`src/routes/nsfw-moderation/audit.ts:29` — `svc.getAuditLog` returns the raw
`ModAction[]` array to any caller with `moderation.review`. `ModAction`
includes `performedBy` (the admin/moderator identity). Both `moderator` and
`admin` roles pass `requireModerationReview`. A moderator reading a user's audit
trail sees other moderators' identities; a user reading their own GDPR export
via `exportUserData` sees the moderator identity that took action against them.

## Evidence

| File | Line | Issue |
| --- | --- | --- |
| `src/routes/nsfw-moderation/audit.ts` | 29 | Raw `ModAction[]` returned to caller with `moderation.review` |
| `src/nsfw/moderation-service/audit.ts` | 162-191 | `mapAction` projects full `ModAction` including `performedBy` |
| `src/nsfw/moderation-service/types.ts` | 32-47 | `ModAction` interface: `performedBy: string` |
| `src/routes/nsfw-moderation/shared.ts` | 59-65 | `requireModerationReview` passes for both `moderator` AND `admin` role |

```ts
// audit.ts:29 — raw ModAction[] returned
const actions = await svc.getAuditLog(ctx.params.userId, { limit, offset },);
return jsonResponse({ ...SuccessResponse, data: actions },);

// ModAction interface:
interface ModAction {
  performedBy: string;   // ← moderator identity exposed to other moderators
  reason: string;       // ← admin case-detail also exposed
}
```

## Existing-Ticket-Check

- No open ticket covers this read-side `performedBy` exposure.
- `BUG-nsfw-modactions-performedby-from-body` (closed) covers write-side
  performedBy impersonation (`performedBy` accepted from request body) —
  different surface and attack vector.
- `BUG-admin-auxtelemetry-leaks-userid-chatid` (closed) covers raw error
  strings in admin telemetry — same bug class but different surface.

## Impact

- A moderator reading a user's audit log sees other moderators' identities.
- A user reading their own GDPR export (`exportUserData`) sees the moderator
  identity that took action against them.
- An admin with `moderation.review` can correlate moderator activity across users.

## Fix

Return a redacted `AuditLogView` projection from `getAuditLog` that drops
`performedBy`. The admin-only surfaces (future) can retain it under a separate
`admin.system` capability gate.

```ts
interface AuditLogView {
  id: string;
  actionType: string;
  targetUserId: string;
  reason: string;          // capped at 200 chars in exportUserData
  scope: string;
  scopeId: string | null;
  createdAt: string;
}
// performedBy omitted — moderator identity not visible to other moderators or users
```

## Acceptance Criteria

- [ ] `getAuditLog` returns redacted view (no `performedBy`) to `moderation.review` callers
- [ ] `exportUserData` (GDPR) does not surface `performedBy` to the user
- [ ] `requireModerationReview` docs updated to note the redaction
- [ ] Tests verify redaction in `getAuditLog` response
- [ ] `bun run check` + `bun test src/nsfw/moderation-service/` green
