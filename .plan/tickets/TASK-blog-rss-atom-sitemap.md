<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RSS / Atom Feeds + Sitemap for Public Blog Posts

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-blog-system
**Related:** `TASK-blog-publish-unit-to-post-bridge.md`, `TASK-blog-unit-scheduled-serialization.md`, `src/routes/blog/index.ts`, `src/routes/v1/content-surface.ts`, `src/db/schema-blog.ts`, `src/rpg/blog/service/posts.ts`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Give public blog posts a syndication surface: RSS 2.0 + Atom feeds and a
sitemap, generated from the shipped `blog_posts` table. Verified gap: there is
zero feed/sitemap machinery anywhere in `src/`.

## Context

**Verified gap:** no RSS, Atom, sitemap, or `<feed>` route exists — zero
matches for `application/rss+xml` / `application/atom+xml` / `sitemap.xml` /
`<feed` under `src/`. Public posts have no way to be followed outside the app.

**Visibility discipline is the whole risk.** `blog_posts.visibility` tiers are
public / followers / private, and follower-gated listing already exists
(`src/rpg/blog/service/posts.ts:162`). Feeds and the sitemap are
**unauthenticated** surfaces: only `visibility = public` AND
`status = published` rows may ever appear. A followers-tier post leaking into
`/rss` is an access-control bug, not a formatting bug — the selection query is
the security-critical part of this ticket.

**Reuse:**

- Route placement alongside the existing blog routes — the barrel at
  `src/routes/blog/index.ts` (mounted at
  `src/routes/v1/content-surface.ts:62`), not a new top-level plugin.
- Render + sanitize via `marked` (configured
  `src/frontend/chat-vendor.ts:12`) and `SANITIZE_CONFIG`
  (`src/frontend/alpine/chat-utils/sanitize.ts:9-47`); feed item content is
  sanitized HTML or a plain-text summary derived from the same pipeline.
- Ordering + freshness from `published_at` (`src/db/schema-blog.ts:42`).

**Scope limit:** per-author feeds are public-author scoped and follow the same
public-only rule. Personalized feeds are out of scope — a feed that changes
per viewer is not cacheable and not a feed.

## Acceptance Criteria

- [ ] A feed route (RSS 2.0 and Atom) and a sitemap route exist under the blog
      route family; both are mounted through the existing barrel
- [ ] Only `visibility = public` AND `status = published` posts appear;
      followers / private / scheduled / hidden / disabled rows are excluded by
      a tested selection query
- [ ] Correct `Content-Type` per format; output is well-formed XML (a parse
      check in the test)
- [ ] Item content sanitized through `SANITIZE_CONFIG` — no raw marked output
- [ ] Deterministic ordering; feed freshness timestamp derived from
      `published_at`, not `now()`
- [ ] A regression test asserts a followers-tier post set to publish never
      reaches the feed or the sitemap
