<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: persona handlers missing role check — horizontal privilege escalation

**Status:** Open
**Priority:** high
**Effort:** Small
**Area:** users/personas
**Source:** reconcile review (Scout Batch B — ISSUE-001)

## Evidence

`src/personas/handlers.ts:36-47, 60-67, 78-85, 93-100, 108-115` — `handleGetPersona`, `handleUpdatePersona`, `handleDeletePersona`, `handleConvertToCharacter` all check `if (!userId) return jsonError(...)` but do NOT check `userRole`.

```
export async function handleGetPersona(ctx: Elysia.Context) {
  const userId = ctx.store.userId;   // ✓ present
  const userRole = ctx.store.userRole; // ✗ absent — no guard
  if (!userId) return jsonError(...);
  // No role check — any authenticated user can read any persona by ID
}
```

## Impact

Horizontal privilege escalation: any authenticated user can read, update, delete, or convert any other user's persona by ID. Scope: user A's persona record is exposed/modified by user B.

## Fix

Add ownership or admin check at the top of each handler:

```ts
const persona = await db.selectFrom("personas").where("id","=",id).executeTakeFirst();
if (!persona) return jsonError(404, "Not found");
if (persona.user_id !== userId && !can(userRole, "admin.users")) {
  return jsonError(403, "Forbidden");
}
```

## Verification

- Add unit test: `handleUpdatePersona` called by non-owner → 403.
- Run `bun run check` (lint covers `can()` usage).

## Acceptance Criteria

- [ ] All 5 persona handlers enforce ownership or admin role
- [ ] Non-owner gets 403
- [ ] `bun run check` clean
