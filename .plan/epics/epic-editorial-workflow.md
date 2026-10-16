<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Editorial Review Workflow (Threads, Suggestions, Beta Readers)

**Overview:** (see ## Overview below)

**Status:** Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** editorial, review, comments, suggestions, beta-readers, publications, blog

## Summary

A review-thread model attachable to publication units and blog posts: inline
comments and suggested edits on markdown, a beta-reader surface that captures
feedback from readers other than the author, and an author-side
accept / reject / merge resolution flow.

## Overview

Publishing today ends at the author. The publishing epic
(`epic-narrative-publishing-workflows.md`) gives exactly two feedback verbs per
unit — pin and accept/reject of a *generated candidate*
(`TASK-publication-artifact-versioning.md`,
`TASK-book-unit-editor-review-surface.md`). There is no place for a second
person — an editor, a beta reader — to say "this paragraph drags" or propose a
replacement sentence and have the author act on it. This epic builds that
second-person surface.

What is honestly missing, stated precisely, because "no comments exist" is
false in a repo with a comment table:

- **The comment-shaped things that exist are not comments for content.**
  `blog_comments` (`src/db/schema-blog.ts:11-19`) is a real threaded model
  (`parent_comment_id`, `blog_comments_parent_idx` in
  `src/db/migrations/001_init.ts:3040`) attached to *blog posts*, with
  moderation status. `ShadowNotes` / `Whitenotes` (`src/db/schema-gm.ts:18-32`,
  `:35-47`) are **not** a comment system: they are `chat_id`-scoped, carry no
  parent/reply key at all, and exist as player-reveal mechanics
  (`revealed_to`, `trigger_condition`). Reusing either for editorial review
  would mean bending a chat-reveal mechanic or a public blog comment into an
  editorial tool.
- **No entity exists for a comment on a publication unit.** The polymorphic
  asset-link vocabulary `AssetLinkEntity` (`src/db/enums-content.ts:73-84`) is a
  closed union with exactly ten members — `chat, character, world, actor,
  location, quest, item, memory, message, asset` — and contains neither
  `blog_post` nor `publication_unit`. Extending a closed union is a schema-and-
  enum change with downstream exhaustiveness checks, so it is an explicit
  ticket, not an incidental edit.
- **The honest gap is surface, not primitives.** A before→after side-by-side +
  unified diff is already *planned* — `TASK-admin-revisions-diff-revert.md`
  (Not Started, `epic-frontend-admin`, low priority) — but its entity list
  ("worlds, locations, characters, items, notes, chat settings", `:19`)
  **excludes publications entirely**, and it is an *admin* revisioning tool, not
  an author-facing review flow. Likewise `TASK-asset-versioning.md`
  (`epic-items`) versions asset **bytes** only. So the gap is: no landed,
  publication-scoped, author-facing review surface — not "no text diff exists".
  This epic does not wait on that ticket and does not duplicate it.

### Verified ground state (2026-10-16)

| Component | Status | Location |
| --------- | ------ | -------- |
| Per-unit pin / accept / reject | Planned | `TASK-book-unit-editor-review-surface.md`, `TASK-publication-artifact-versioning.md` (publishing epic) |
| Threaded comment precedent | ✅ Shipped (blog only) | `blog_comments.parent_comment_id` (`src/db/schema-blog.ts:11-19`); threaded tree builder `listCommentsThreaded` (`src/rpg/blog/service/comments.ts:93-131`); routes `src/routes/blog/comments.ts` |
| Comment state machines | ✅ Shipped (adjacent) | `ShadowNoteStatus` / `ShadowNoteVisibility` (`src/db/enums-gm.ts:50,74`), `injectShadowRevealNarration` (`src/routes/gm-notes/narration.ts:31`) — scoped to chat reveal mechanics, not editorial |
| Review entity vocabulary | ❌ Absent | `AssetLinkEntity` (`src/db/enums-content.ts:73-84`): 10 members, no `blog_post`, no `publication_unit` |
| Suggestion / proposed-edit model | ❌ Absent | No table, no anchor concept anywhere in `src/db/schema-*.ts` |
| Preview→confirm state machine | ✅ Shipped (chat merges) | `guardDraftToConfirmed` transitions `branch_merges.status` `draft → confirmed` (`src/chat/service/merge/merge-store.ts:212-225`), result rows badged with `messages.merge_id` (`src/db/schema-core.ts:793`) |
| Admin before→after diff | Planned, excludes publications | `TASK-admin-revisions-diff-revert.md:19` (entity list omits publications) |

### What this epic adds

| Piece | Reuses | Ticket |
| ----- | ------ | ------ |
| Closed-union target vocabulary for review threads | The `AssetLinkEntity` precedent (`src/db/enums-content.ts:73-84`) — extended or deliberately not | `TASK-review-thread-target-vocabulary.md` |
| Threaded review comments on a unit or a blog post | `blog_comments` shape (`src/db/schema-blog.ts:11-19`) + `listCommentsThreaded` | `TASK-review-thread-comment-model.md` |
| Suggested edits anchored into unit markdown | `marked` tokenizing (`src/frontend/chat-vendor.ts:12-15`); `branch_merges` draft→confirm shape | `TASK-inline-markdown-suggestion-model.md` |
| Author resolution surface (accept / reject / merge) | `publicationStatusMachine` transition style (`src/db/enums-story/items.ts:68`); htmx fragment contract | `TASK-author-suggestion-resolution-surface.md` |
| Beta-reader surface with feedback capture | The publication viewer (`TASK-publication-viewer-read-mode.md`) as the read surface | `TASK-beta-reader-feedback-surface.md` |

## Scope

- **Attachable, not owned.** The thread model targets entities; the two targets
  in v1 are publication units and blog posts. No chat comments, no per-message
  review, no public comment threads on anything else.
- **Markdown-anchored suggestions.** A suggestion quotes a span of the unit's
  markdown body and proposes replacement text. Anchoring is by line/heading
  offset into the unit body, not by character offset into rendered HTML — the
  body is the source of truth (`epic-narrative-publishing-workflows.md`'s
  canonical-markdown binding) and the edit must survive re-render.
- **Author-side resolution only.** Suggestions change the unit body through an
  explicit author action: accept (apply the suggestion), reject (dismiss, body
  untouched), or merge (apply with author edits). No auto-apply, ever.
- **Beta readers are invited, not public.** A beta reader is a per-publication
  invited identity with read + comment rights on that publication only. There
  is no public comment form in this epic.

## Non-goals

- **Not a chat feature.** No chat messages, no GM notes, no
  `story_turns`/`chat_id` involvement; the shadow-notes mechanics
  (`src/db/schema-gm.ts`) are unrelated and untouched.
- **Not public comments.** No anonymous or unauthenticated commenting, no
  comment widget for arbitrary pages, no social layer.
- **Not admin revisioning.** `TASK-admin-revisions-diff-revert.md` owns
  world/entity revision history (and its entity list excludes publications);
  this epic builds the author-facing review flow and does not extend that
  ticket's scope or wait for it.
- **Not a versioning store.** Unit body versioning / keep-or-discard is
  `TASK-publication-artifact-versioning.md`; asset byte versioning is
  `epic-items`. Suggestions ride on those, they do not replace them.
- **Not export.** Neither the comment set nor the resolved unit body has an
  export format here; `TASK-publication-export-formats.md` owns delivery.
- **No new intent taxonomy, no workflow-template DSL.** Review actions are
  routes and fragments; nothing is added to `AssistantIntent`
  (`src/regex/intent.ts`) or to the workflow-template schema.

## Tasks

- [ ] `TASK-review-thread-target-vocabulary.md` — the closed-union target decision, landed as an enum + migration
- [ ] `TASK-review-thread-comment-model.md` — threaded comments on publication units and blog posts
- [ ] `TASK-inline-markdown-suggestion-model.md` — suggested edits anchored to unit markdown, preview→confirm
- [ ] `TASK-author-suggestion-resolution-surface.md` — author-side accept / reject / merge
- [ ] `TASK-beta-reader-feedback-surface.md` — invited beta readers with feedback capture

## Dependencies

- `epic-narrative-publishing-workflows.md` — the publication units the threads
  attach to. That epic claims `057_publication_artifacts.ts` and
  `058_publication_unit_revisions.ts`; this epic's migrations number after
  those (see each ticket for its claim).
- `epic-blog-system.md` — blog posts as a second thread target; read-only
  dependency, that epic is not edited by this one.
- `TASK-publication-viewer-read-mode.md` — the read surface a beta reader uses.

## Acceptance Criteria

- [ ] A reviewer with access can open a thread on a publication unit or a blog
      post and reply within it
- [ ] A reviewer can propose a replacement for a span of a unit's markdown body
      and the proposal is stored without touching the body
- [ ] The author sees every open suggestion, and accept / reject / merge each
      leave the unit in a state a subsequent read reflects exactly
- [ ] Applying a suggestion writes the unit body through the same owned path as
      a hand edit, so versioning (`TASK-publication-artifact-versioning.md`)
      sees it as an ordinary body change
- [ ] A non-invited identity cannot read or write threads on a private
      publication (route tests)
- [ ] No comment, thread, or suggestion row is reachable through any chat or
      GM-notes surface
