<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add blog state machines: BlogPostStatus, BlogPostVisibility, BlogCommentStatus

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-blog-system

## Summary

Replace string-typed status/visibility in blog_posts and blog_comments with strictly typed state machines. BlogPostStatus: draft→visible→archived. BlogPostVisibility: public→private→unlisted. BlogCommentStatus: visible→hidden→deleted. The 015_blog_system.ts migration defaults to 'draft'/'visible'. Must create src/db/enums-core/blog-status.ts with StateDef + createMachine + CompositeValidator, export from index, and update schema-core.ts.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
