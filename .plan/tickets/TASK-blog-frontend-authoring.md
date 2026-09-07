<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Blog Frontend Authoring

**Status:** 🟡 Partial (reader + authoring UI on `blog-frontend-left-menu`, unmerged)
**Priority:** P1
**Effort:** High
**Epic:** epic-frontend-backend-integration
**Tags:** blog, frontend, authoring, posts, comments

## Summary

Create blog authoring and reader UI. Backend routes exist at `/api/blog/*` (posts, comments, follow, sources) including threaded comments and single-comment endpoint. Reader + authoring UI landed on branch `blog-frontend-left-menu`: `src/views/blog.html` (list, search/tag filter, create form, detail with threaded comments, follow toggle, RAG sources) linked into the left sidebar (`nav-blog`), `src/frontend/alpine/blog.ts` + `blog-types.ts` store (search, follow/unfollow/status, sources, envelope-tolerant parsing), `src/frontend/pages/blog.ts` (`blogPage()` component). Open: WYSIWYG rich-text editor (plain-markdown form only), draft management, category filtering, moderation/follower-management UI.

## Backend Routes (already exist)

| Route                                   | Method | Purpose             |
| --------------------------------------- | ------ | ------------------- |
| `/api/blog/posts`                       | GET    | List posts          |
| `/api/blog/posts/:id`                   | GET    | Get post            |
| `/api/blog/posts`                       | POST   | Create post         |
| `/api/blog/posts/:id`                   | PATCH  | Update post         |
| `/api/blog/posts/:id`                   | DELETE | Delete post         |
| `/api/blog/posts/:id/comments`          | GET    | List comments (threaded) |
| `/api/blog/posts/:id/comments/:commentId` | GET  | Get single comment with children |
| `/api/blog/posts/:id/comments`          | POST   | Add comment (with parent_comment_id) |
| `/api/blog/follow/:authorId`            | POST   | Follow author       |
| `/api/blog/follow/:authorId`            | DELETE | Unfollow author     |
| `/api/blog/follow/:authorId/status`     | GET    | Check follow status |
| `/api/blog/authors/:authorId/followers` | GET    | List followers      |
| `/api/blog/posts/:id/sources`           | GET    | RAG sources         |

## Frontend Files Created

- `src/frontend/alpine/blog.ts` + `blog-types.ts` — Alpine.js blog store (loadPosts, loadPost, createPost, createComment, listComments, searchPosts/visiblePosts, followAuthor/unfollowAuthor/getFollowStatus, loadSources)
- `src/frontend/pages/blog.ts` — `blogPage()` Alpine component + `initBlogPage`
- `src/views/blog.html` — list, search/tag filter, inline create form, detail with threaded comments, follow toggle, RAG sources
- `src/views/layout.html` — left-sidebar `nav-blog` link (`/views/blog`)
- `src/public/locales/*.json` — `navigation.blog` + `blog.*` strings (10 locales)

## Acceptance Criteria

- [x] Blog Alpine store with `apiFetch` and `jsonBody`
- [x] Blog page module registered in `pages.ts`
- [x] Post list with search/filter
- [ ] Post creation with rich text editor (plain-markdown form landed; WYSIWYG open)
- [x] Post detail view with threaded comments
- [x] Comment submission with threading support
- [x] Follow/unfollow author
- [x] RAG sources display
- [ ] Draft management
- [x] Tag filtering (category filtering open)

## Related

- `epic-blog-system.md` — Blog epic
- `TASK-blog-system.md` — Existing task (updated: threading + visibility done)
- `BUG-blog-comments-lack-threading-parent-comment-id-blocking-lemm.md` — Resolved by `075_blog_comments_threading.ts` migration