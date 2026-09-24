---
hash: pending

git issue: 5ccf305

**Summary:** `GET /api/blog/authors/:authorId/followers` is fully unauthenticated and leaks the complete follower-id list for any author.
**Context:** `src/routes/blog/follows.ts` (followers handler); `src/rpg/blog/service/follows.ts` (`getFollowers`).
**Acceptance Criteria:** route requires auth (401 unauthenticated); only the author themselves or an admin may list followers (403 otherwise); response schema declares 401/403; route-level tests cover the branches.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Blog followers list has no authentication (unauthenticated enumeration)

**Status:** done
**Priority:** High
**Effort:** Small

## Summary

`GET /api/blog/authors/:authorId/followers` (`src/routes/blog/follows.ts:75`) has no `requireUserId` call, making it fully unauthenticated. The service-layer `getFollowers()` (`src/rpg/blog/service/follows.ts:52`) returns a raw `follower_id` array with no caller context. Any unauthenticated requester can enumerate the complete follower list — including follower IDs — for any blog author, including private accounts.

## Defect Detail

**Route handler** (`src/routes/blog/follows.ts:75`):

```typescript
.get(`${prefix}/blog/authors/:authorId/followers`, async (ctx: any,) => {
  const followers = await svc.getFollowers(ctx.params.authorId,);
  return jsonResponse({ success: true, followers, count: followers.length, },);
}, {
  response: {
    200: ListResponse(BlogPostResponse,),
    // NO 401 response — route has no requireUserId call
  },
```

**Service layer** (`src/rpg/blog/service/follows.ts:52`):

```typescript
export async function getFollowers(
  db: Kysely<any>,
  authorId: string,
): Promise<string[]> {
  const rows = await db
    .selectFrom("blog_follows",)
    .select("follower_id",)
    .where("author_id", "=", authorId,)
    .execute();
  return Array.from(rows, (r: any,) => r.follower_id as string,);
}
```

No authentication, no authorization. Every other follow-related endpoint in the same file (`POST /follow/:authorId`, `DELETE /follow/:authorId`, `GET /follow/:authorId/status`) correctly calls `requireUserId`.

## Fix Outline

1. Add `requireUserId(ctx)` to the GET `/blog/authors/:authorId/followers` handler.
2. Gate: caller must be the `authorId` themselves, or have `admin.settings`. Return 403 otherwise.
3. Add `401` to the route's `response` schema.

## Existing Ticket Check

No duplicate slug in `.plan/tickets/index.json`. Searched for: `followers.*auth`, `blog.*follower.*auth`, `followers.*leak` — no matches.

## Acceptance Criteria

- [ ] Route requires authentication (401 for unauthenticated requests)
- [ ] Only the author themselves or an admin can list an author's followers (403 otherwise)
- [ ] `getFollowers()` unit test covers auth-gated and ungated scenarios
