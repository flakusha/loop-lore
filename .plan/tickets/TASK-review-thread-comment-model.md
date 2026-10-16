<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Review Thread + Comment Model

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-editorial-workflow
**Related:** `TASK-review-thread-target-vocabulary.md`, `TASK-inline-markdown-suggestion-model.md`, `TASK-beta-reader-feedback-surface.md`

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The thread model itself: a thread per `(target, anchor)` and comments inside it,
threaded by parent, attachable to a publication unit or a blog post. Service +
routes + tests, modeled on the shipped `blog_comments` shape.

## Context

The precedent to copy is `blog_comments` (`src/db/schema-blog.ts:11-19`):
`id, post_id, author_id, body, status, created_at, parent_comment_id`, with
`parent_comment_id` self-referencing `blog_comments.id` (`ON DELETE CASCADE`,
indexed — `blog_comments_parent_idx`, `src/db/migrations/001_init.ts:3040`), a
threaded tree built in memory by `listCommentsThreaded`
(`src/rpg/blog/service/comments.ts:98-115`), and routes under
`src/routes/blog/comments.ts`. That model is right; its target (`blog_posts`,
public comments, moderation `status`) is what differs here.

Shape, adapted — the target is polymorphic (the vocabulary from
`TASK-review-thread-target-vocabulary.md`), the comment carries an optional
anchor, and the lifecycle is `open | resolved` rather than a moderation status:

```
review_threads
  id, target_type, target_id,      -- closed union from the vocabulary ticket
  status,                          -- open | resolved
  created_by, created_at, updated_at
  UNIQUE (target_type, target_id)   -- one editorial thread per unit/post in v1

review_comments
  id, thread_id, author_id, body,
  parent_comment_id,               -- NULL = top-level; same cascade shape as blog_comments
  status,                          -- active | deleted (soft, matching blog_comments)
  created_at, updated_at
```

The `UNIQUE (target_type, target_id)` is deliberate v1 laziness: per-unit
review is one continuous conversation, and spawning parallel threads on one
chapter is a UX nobody asked for. `ponytail:` if reviewers start wanting
per-paragraph threads, drop the unique constraint then — not before.

Comments are **not** chat and **not** GM notes: no `chat_id` column, nothing
wired to `story_turns`, no `revealed_to`/`trigger_condition` reveal mechanics.
The shadow-note state machines (`ShadowNoteStatus`, `ShadowNoteVisibility`,
`src/db/enums.ts`) stay out of this table — a review comment has one visibility
rule: whoever can read the target can read the thread.

```
review_suggestions
  id, comment_id,                  -- a suggestion is a comment with an attached proposal
  anchor (see TASK-inline-markdown-suggestion-model.md),
  state                            -- proposed | accepted | rejected | merged
```

The `review_suggestions` table itself belongs to
`TASK-inline-markdown-suggestion-model.md`; this ticket only establishes
`review_comments.comment_id` as the join point (a comment with no suggestion row
is a plain comment).

Routes follow the repo's own conventions: htmx-friendly JSON under
`src/routes/`, owner-or-invited authorization enforced per read and write (a
non-participant gets 404, not an empty list — the rule every publication route
in this repo follows), and the same escape-by-default rendering path the
publication editor uses (`src/routes/views/escape-html.ts`).

Migration: `061_review_threads.ts` is claimed by
`TASK-review-thread-target-vocabulary.md`; this ticket adds its columns there
or, if that ticket already shipped, in the next free number. Under no
circumstances do two tickets co-own one migration file — that rule is stated
verbatim in `TASK-publication-artifact-versioning.md` and it applies here too.
`src/db/migrations/README.md` is the policy of record (one `ADD COLUMN` per
`alterTable`).

## Acceptance Criteria

- [ ] `review_threads` + `review_comments` exist per the shape above, created by
      an append-only migration per `src/db/migrations/README.md`
- [ ] A thread can be opened on a publication unit and on a blog post, and
      opening a second thread on the same target returns the existing one rather
      than erroring or duplicating
- [ ] Comments thread through `parent_comment_id` with the same cascade delete
      and index treatment as `blog_comments`; `listThreaded` builds the tree
- [ ] Threads resolve and reopen; a resolved thread still reads, and new
      comments on a resolved thread are rejected with a named reason (reopen
      first)
- [ ] A comment body renders escaped by default; no raw markdown/HTML is
      emitted through any read path
- [ ] Authorization: the publication owner, an invited beta reader
      (`TASK-beta-reader-feedback-surface.md`), and the blog post author can
      read and write; everyone else gets 404 (route tests for both targets)
- [ ] Deleting a comment is soft (`status = deleted`) and its children remain
      readable, matching the blog precedent
- [ ] No chat, GM-notes, or story-turn table is touched (asserted by the diff:
      zero references to `chat_id` or `story_turns` in the new modules)
