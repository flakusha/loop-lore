<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add ownership checks to character routes

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-logic-reconciliation

## Summary

7 character route files lack ownership checks — any authenticated user can read/modify any character's data.

## Affected Routes

| Route File                   | Endpoints                             | Missing Check         |
| ---------------------------- | ------------------------------------- | --------------------- |
| `character-mood.ts`          | GET/POST/PUT/PATCH/DELETE mood        | No owner verification |
| `character-relationships.ts` | GET/POST/PUT/DELETE relationships     | No owner verification |
| `character-traits.ts`        | GET/POST/PUT/DELETE traits (3 layers) | No owner verification |
| `character-licensing.ts`     | GET/POST/DELETE licensing             | No owner verification |
| `character-availability.ts`  | GET/POST/DELETE availability          | No owner verification |
| `character-emotions.ts`      | GET/POST/DELETE emotions              | No owner verification |
| `character-avatars.ts`       | GET/POST/PUT/DELETE avatars           | No owner verification |

## Pattern

Each route checks `userId` (authenticated) but does NOT verify the user owns the actor:

```ts
// Current (insecure):
const userId = ctx.userId as string | null;
if (!userId) { return jsonError({ message: "Unauthorized", ... }); }
const { actorId } = ctx.params;
// Proceeds to modify ANY actor's data

// Fix needed:
const actor = await database.selectFrom("actors").select("owner_id")
  .where("id", "=", actorId).executeTakeFirst();
if (!actor || (actor.owner_id !== userId && userRole !== "admin")) {
  return jsonError({ message: "Actor not found", status: 404 });
}
```

## Acceptance Criteria

- [ ] All 7 route files verify actor ownership before read/write
- [ ] Admin role bypasses ownership check
- [ ] Solo role bypasses ownership check
- [ ] Tests pass: `bun test src/routes/`
