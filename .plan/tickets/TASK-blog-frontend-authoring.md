<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Blog Frontend Authoring

**Status:** ⬜ Not Started
**Priority:** P1
**Effort:** High
**Epic:** epic-frontend-backend-integration
**Tags:** blog, frontend, authoring, posts, comments

## Summary

Create blog authoring and reader UI. Backend routes exist at `/api/blog/*` (posts, comments, follow, sources) but no frontend UI exists.

## Backend Routes (already exist)

| Route                                   | Method | Purpose             |
| --------------------------------------- | ------ | ------------------- |
| `/api/blog/posts`                       | GET    | List posts          |
| `/api/blog/posts/:id`                   | GET    | Get post            |
| `/api/blog/posts`                       | POST   | Create post         |
| `/api/blog/posts/:id`                   | PUT    | Update post         |
| `/api/blog/posts/:id`                   | DELETE | Delete post         |
| `/api/blog/posts/:id/comments`          | GET    | List comments       |
| `/api/blog/posts/:id/comments`          | POST   | Add comment         |
| `/api/blog/follow/:authorId`            | POST   | Follow author       |
| `/api/blog/follow/:authorId`            | DELETE | Unfollow author     |
| `/api/blog/follow/:authorId/status`     | GET    | Check follow status |
| `/api/blog/authors/:authorId/followers` | GET    | List followers      |
| `/api/blog/posts/:id/sources`           | GET    | RAG sources         |

## Files to Create

- `src/frontend/alpine/blog.ts` — Alpine.js blog component
- `src/components/blog/post-editor.html` — Post editor template
- `src/components/blog/post-list.html` — Post list template
- `src/components/blog/post-detail.html` — Post detail + comments
- `src/frontend/pages/blog.ts` — Page-specific blog code

## Acceptance Criteria

- [ ] Post list with search/filter
- [ ] Post creation with rich text editor
- [ ] Post detail view with comments
- [ ] Comment submission
- [ ] Follow/unfollow author
- [ ] RAG sources display
- [ ] Draft management
- [ ] Tag/category filtering

## Related

- `epic-blog-system.md` — Blog epic
- `TASK-blog-system.md` — Existing task (needs updating)
