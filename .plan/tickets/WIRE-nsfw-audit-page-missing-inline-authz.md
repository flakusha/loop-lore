<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# WIRE: nsfw-audit view route has no inline authz guard

**Status:** Resolved
**Priority Tier:** P2
**Source:** reconcile review (Scout Batch B — ISSUE-002)
`src/routes/views/nsfw-audit.ts:19-25` — `serveNsfwModerationAudit` calls `can(userRole, "admin.system")` in the template but has NO inline `beforeHandle` guard. The route is registered via `plugin-pages.ts` which may or may not apply `adminViewGuard`.
If the route is ever mounted outside the `adminViewGuard` scope, NSFW ban history and user preferences are exposed to any authenticated user.
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

Fixed in commit `2ac5cf29` (fix(wire): 3 P2-Reconcile tickets): the same commit also wrapped /views/nsfw-moderation in `requirePermission('admin.system')` guard, added the impersonate dispatch in `command-buttons.runCommand`, and added the linkAsset() call in `src/routes/characters/create.ts` after actor insert.