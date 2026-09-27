<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Blog System

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Status Note:** core CRUD + comments + follows + moderation built
**Priority:** low
**Effort:** Medium
**Epic:** epic-blog-system

## Summary

Blog system: markdown-based blog, RSS feed, static export. From Epic 40.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


## Verification 2026-09-26

Verdict: **still-open-expanded** (backend + frontend shipped well beyond the 3-line ACs; RSS + static export never built).

Src checked:
- Backend `src/routes/blog/` — posts CRUD (`posts.ts`), threaded comments incl. single-comment endpoint (`comments.ts:98`), follows/unfollow/status/followers (`follows.ts`), moderation PATCH (`moderation.ts:64`), RAG sources (`rag.ts`), visibility policy (`post-read-policy.ts`); route-tested (`posts.test.ts`, `comments.test.ts`, `follows.test.ts`, `index.test.ts`).
- Frontend — `src/views/blog.html` (206 lines: list, search/tag filter, create form, threaded detail, follow toggle, RAG sources), `src/frontend/alpine/blog.ts` + `blog-types.ts` store, `src/frontend/pages/blog.ts` `blogPage()`, sidebar `nav-blog` in `layout.html:129-134` (pinned by `src/routes/views/blog.test.ts`), `blog.*` i18n strings in 10 locales.
- ABSENT repo-wide: no RSS/feed/syndication route, no static-export path (grep over `src/` + `scripts/` hits only process-RSS memory metrics and unrelated comments).

Refreshed deltas:
- The ticket's own ACs ("Implementation complete / Tests passing / Docs updated") are too thin to close on — replace with: CRUD + comments + follows + moderation + reader/authoring UI done (cite files above); WYSIWYG/drafts/categories owned by `TASK-blog-frontend-authoring`; RSS feed + static export have no owner — file or explicitly descope before closing this FEAT.
