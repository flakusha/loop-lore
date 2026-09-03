<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Blog Frontend Authoring

**Status:** ⬜ Not Started
**Priority:** P1
**Effort:** High
**Epic:** epic-frontend-backend-integration
**Tags:** blog, frontend, authoring, posts, comments

## Summary

Create blog authoring and reader UI. Backend routes exist at `/api/blog/*` (posts, comments, follow, sources) including threaded comments and single-comment endpoint. Frontend Alpine store and page module created.

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

- `src/frontend/alpine/blog.ts` — Alpine.js blog store (loadPosts, loadPost, createPost, createComment, listComments)
- `src/frontend/pages/blog.ts` — Blog page entry point

## Acceptance Criteria

- [x] Blog Alpine store with `apiFetch` and `jsonBody`
- [x] Blog page module registered in `pages.ts`
- [ ] Post list with search/filter
- [ ] Post creation with rich text editor
- [ ] Post detail view with threaded comments
- [ ] Comment submission with threading support
- [ ] Follow/unfollow author
- [ ] RAG sources display
- [ ] Draft management
- [ ] Tag/category filtering

## Related

- `epic-blog-system.md` — Blog epic
- `TASK-blog-system.md` — Existing task (updated: threading + visibility done)
- `BUG-blog-comments-lack-threading-parent-comment-id-blocking-lemm.md` — Resolved by `075_blog_comments_threading.ts` migration