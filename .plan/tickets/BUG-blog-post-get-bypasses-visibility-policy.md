---
hash: pending

git issue: 680817d

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Blog post GET bypasses visibility policy (IDOR)

**Status:** Open
**Priority:** High
**Effort:** Small

## Summary

`GET /api/blog/posts/:id` (`src/routes/blog/posts.ts:60`) has no authentication check, and the service-layer `getPost()` (`src/rpg/blog/service/posts.ts:79`) performs a raw key-value lookup with no visibility or status enforcement. Any authenticated user who knows or guesses a post ID can read the full content of private or draft blog posts.

## Defect Detail

**Route handler** (`src/routes/blog/posts.ts:60`):
```typescript
.get(`${prefix}/blog/posts/:id`, async (ctx: any,) => {
  const t = ctx.t as TranslatorFn | undefined;
  const post = await svc.getPost(ctx.params.id,);  // ← NO auth, NO visibility check
  if (!post) { return jsonError({..., status: HttpStatus.NotFound, t,},); }
  await svc.incrementViewCount(post.id,);
  return jsonResponse({ success: true, post, },);
```

**Service layer** (`src/rpg/blog/service/posts.ts:79`):
```typescript
export async function getPost(db: Kysely<any>, id: string,): Promise<BlogPostWithTags | undefined> {
  const row = (await db
    .selectFrom("blog_posts",)
    .selectAll()
    .where("id", "=", id,)
    .executeTakeFirst()) as BlogPostRow | undefined;
  if (!row) { return undefined; }
  const tags = await getTags(db, id,);
  return { ...row, tags, };
}
```

No visibility column check, no status column check, no caller context passed. Compare with `listPosts()` (posts.ts:107) which correctly gates on visibility via the `filters` parameter.

## Fix Outline

1. Add `requireUserId(ctx)` to the GET route handler.
2. After fetching the post, gate: `visibility === 'public'` OR caller is the post author OR caller has `admin.settings`. Return 404 otherwise.
3. Alternatively: add visibility/status enforcement inside `getPost()` via an optional caller context parameter.

## Existing Ticket Check

No duplicate slug in `.plan/tickets/index.json`. Searched for: `blog.*post.*get`, `visibility.*policy`, `getPost` — no matches.

## Acceptance Criteria

- [ ] Route requires authentication (401 for unauthenticated requests)
- [ ] Private/draft posts return 404 when caller is not the author and not admin
- [ ] Public posts accessible to any authenticated user
- [ ] `getPost()` unit test covers visibility-gated and ungated cases
