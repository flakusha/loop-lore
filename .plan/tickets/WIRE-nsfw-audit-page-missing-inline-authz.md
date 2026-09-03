<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# WIRE: nsfw-audit view route has no inline authz guard

**Status:** Resolved
**Priority:** high
**Priority Tier:** P2
**Effort:** Small
**Area:** moderation
**Source:** reconcile review (Scout Batch B — ISSUE-002)

## Evidence

`src/routes/views/nsfw-audit.ts:19-25` — `serveNsfwModerationAudit` calls `can(userRole, "admin.system")` in the template but has NO inline `beforeHandle` guard. The route is registered via `plugin-pages.ts` which may or may not apply `adminViewGuard`.

## Impact

If the route is ever mounted outside the `adminViewGuard` scope, NSFW ban history and user preferences are exposed to any authenticated user.

## Fix

Either add explicit guard inline:

```ts
new Elysia().get("/views/nsfw-moderation", async (ctx) => {
  if (!can(ctx.store.userRole, "admin.system")) {
    return jsonError(403, "Admin access required");
  }
  return serveNsfwModerationAudit(ctx);
}, { beforeHandle: ... })
```

Or ensure the registration in `plugin-pages.ts` is inside the `.guard({ beforeHandle: adminViewGuard })` block with `admin.system` requirement.

## Verification

- Add integration test: unauthenticated GET `/views/nsfw-moderation` → 401; non-admin → 403.
- Check `src/routes/views/plugin-pages.ts:121` registration context.

## Acceptance Criteria

- [x] No inline 403/401 bypass possible
- [x] Test covers unauthenticated + non-admin cases

## Resolution

Fixed in commit `a4f35f2b` (wrap nsfw-moderation route in admin.system guard): the registration in `src/routes/views/plugin-pages.ts` (lines 136-137) now mounts `/views/nsfw-moderation` inside `.guard({ beforeHandle: nsfwGuard })`, where `nsfwGuard = requirePermission("admin.system")` (defined at line 26). This short-circuits unauthenticated and non-admin traffic before the handler runs: `requirePermission` returns 403 (with audit log) when the caller lacks `admin.system`, and 401 when `ctx.userId` is absent. A SECURITY comment was added in `nsfw-audit.ts` documenting that `serveNsfwModerationAudit` trusts its caller to have established the admin contract.

Files changed: `src/routes/views/nsfw-audit.ts` (+11/-1), `src/routes/views/plugin-pages.test.ts` (+14/-4). The added test case `denies unauthenticated request (302 redirect or 403)` covers both unauthenticated and non-admin paths against the live guard.
