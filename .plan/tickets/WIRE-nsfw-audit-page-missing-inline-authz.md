<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# WIRE: nsfw-audit view route has no inline authz guard

**Status:** Open
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

- [ ] No inline 403/401 bypass possible
- [ ] Test covers unauthenticated + non-admin cases
