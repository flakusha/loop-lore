<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add blog state machines: BlogPostStatus, BlogPostVisibility, BlogCommentStatus

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-blog-system

## Summary

Replace string-typed status/visibility in blog_posts and blog_comments with strictly typed state machines. BlogPostStatus: draft→visible→archived. BlogPostVisibility: public→private→unlisted. BlogCommentStatus: visible→hidden→deleted. Must create src/db/enums-core/blog-status.ts with StateDef + createMachine + CompositeValidator, export from index, and add `BlogPosts`/`BlogComments` COLUMN_TYPE_OVERRIDES mappings (then `bun run db:sync-types`). No migration.

## Analysis (2026-09-04)

App-layer change only — **no migration needed**. Confirmed in fresh migration-run DDL: `blog_posts.status` `TEXT DEFAULT 'draft'`, `blog_posts.visibility` `TEXT DEFAULT 'public'`, `blog_comments.status` `TEXT DEFAULT 'visible'`. Path: (1) `src/db/enums-core/blog-status.ts` (StateDef + createMachine + CompositeValidator); (2) export from index; (3) `"BlogPosts": { "status": "BlogPostStatus", "visibility": "BlogPostVisibility" }` + `"BlogComments": { "status": "BlogCommentStatus" }` in `COLUMN_TYPE_OVERRIDES` + `bun run db:sync-types`. No `src/db/migrations/*` change.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
