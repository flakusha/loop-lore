<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: no e2e spec covers nsfw moderation admin routes

**Status:** Open
**Priority:** medium
**Effort:** Medium
**Area:** moderation
**Source:** reconcile review (Scout Batch B — ISSUE-008)

## Evidence

`tests/e2e/` has no spec for `GET /api/admin/nsfw`, `PUT /api/admin/nsfw`, `GET /api/admin/nsfw/policy`, flag queue, or appeal flows. Admin dashboard browser tests exist but underlying API is untested.

## Impact

Moderation admin API regression undetected — policy changes, flag queue, and appeals flows not covered in CI.

## Fix

Add `tests/e2e/flows/nsfw-moderation.flows.ts`:

- `GET /api/admin/nsfw` → 200, shape `{ flags, appeals }`
- `PUT /api/admin/nsfw` with flag update → 200
- `GET /api/admin/nsfw/policy` → 200
- `POST /api/admin/nsfw/flags/:id/dismiss` → 200
- `POST /api/admin/nsfw/appeals/:id/approve` → 200

Requires admin auth — use `loginAdmin()` helper.

## Verification

- Run `E2E_SAFEGUARD=1 bun test tests/e2e/flows/nsfw-moderation.flows.ts`

## Acceptance Criteria

- [ ] Flag queue, appeals, and policy routes covered
- [ ] Non-admin → 403 on all admin routes
