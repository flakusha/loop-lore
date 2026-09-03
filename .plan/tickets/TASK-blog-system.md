<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Blog System

**Status:** 🟡 Partial (core CRUD + comments + follows + moderation built; threading + visibility done)
**Priority:** Medium
**Effort:** High
**Epic:** epic-blog-system

## Summary

Blog subsystem supporting both LLM-authored and human-authored posts. Core CRUD + comments + follows + moderation built. Threading and Followers visibility tier now implemented. Remaining: LLM authoring modes, RAG integration, creative world generation.

## Scope

### Already Built

- Blog post CRUD
- Comments and follows
- Content moderation
- **Threaded comments** (`parent_comment_id` self-FK, cascade delete, indexed)
- **Followers visibility tier** (posts only visible to authors the current user follows)
- **Single-comment endpoint** (`GET /api/blog/posts/:id/comments/:commentId`)
- **Nested comment tree** (`GET /api/blog/posts/:id/comments` returns `BlogCommentWithChildren[]`)

### Remaining

- LLM authoring modes (automated / deep research / news)
- RAG pipeline integration for internal-only information
- Creative world generation in blog content

## Linked Epics

- `epic-blog-system.md`
- **Feature spec:** `FEAT-blog-system.md`

## Acceptance Criteria

- [x] Threaded comments with `parent_comment_id` (migration `075_blog_comments_threading.ts`)
- [x] Followers visibility tier via `blog_follows` subquery
- [x] Single-comment endpoint with children
- [ ] LLM authoring modes (automated, deep research, news)
- [ ] RAG pipeline integration for internal information gathering
- [ ] Creative world generation in blog content
- [ ] Blog post schema reuses chat message model
- [ ] Content moderation for generated and user-authored posts
- [ ] Unit tests for LLM authoring modes
- [ ] Integration tests for blog workflow

## Notes

- Reference `epic-blog-system.md` for full system design
- Blog records reuse chat message schema and infrastructure
- Consider moderation for LLM-generated content
- Migration `075_blog_comments_threading.ts` adds `parent_comment_id` column to `blog_comments`