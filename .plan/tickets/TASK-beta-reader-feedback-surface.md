<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Beta Reader Feedback Surface

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-editorial-workflow
**Related:** `TASK-review-thread-comment-model.md`, `TASK-publication-viewer-read-mode.md`, `TASK-publication-reader-locale-selector.md`, `TASK-book-unit-editor-review-surface.md`

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The invited-reader surface: the publication owner invites identities as beta
readers of one publication, and a beta reader gets the read mode plus
per-unit threads, comments, and suggestions — nothing else. No public comment
form exists anywhere in this epic.

## Context

The other half of the loop needs a person who is not the author. The repo has
no beta-reader concept at all: the publication viewer
(`TASK-publication-viewer-read-mode.md`) is owner-scoped read-only, and the
editor (`TASK-book-unit-editor-review-surface.md`) is owner-only. Invitation is
the whole access model — there is no public surface to widen.

Shape, minimal on purpose:

```
publication_beta_readers
  id, publication_id, user_id,
  state,                          -- invited | accepted | revoked
  invited_by, invited_at, responded_at
  UNIQUE (publication_id, user_id)
```

One row per (publication, reader). `accepted` is the only state that grants
read + comment; `invited` and `revoked` grant nothing. Revocation is a state
change, not a delete — the thread history keeps its attribution, and a
re-invite is the same row moving back to `invited`. No email, no token links,
no notification machinery in v1: the invited user sees the publication appear
in their own publication list, which is the invitation. `ponytail:` an
in-app badge is enough; add notifications when someone actually asks.

What a beta reader can do, precisely: read the publication through the existing
viewer surface (the same one `TASK-publication-viewer-read-mode.md` builds —
reused, not forked), and open threads / comments / suggestions on units via
`TASK-review-thread-comment-model.md` and
`TASK-inline-markdown-suggestion-model.md`. What a beta reader cannot do:
resolve threads, accept/reject/merge suggestions (owner-only per
`TASK-author-suggestion-resolution-surface.md`), pin units, regenerate, edit
bodies, or see any unit that is not `PublicationStatus.Published`. The reader
sees the same status filter the viewer enforces — draft and rejected chapters
are absent, exactly as for the owner's read mode.

Feedback capture is deliberately the comment itself. There is no ratings
widget, no per-chapter score, no NPS survey — a reviewer with a thread and a
suggestion model has everything needed to say what is wrong and propose the
fix. `ponytail:` if aggregate feedback is ever wanted, it is a query over
`review_comments`, not a new table.

Migration: `063_publication_beta_readers.ts` — after
`TASK-review-thread-target-vocabulary.md`'s `061` and
`TASK-inline-markdown-suggestion-model.md`'s `062` claims, and after
`epic-publication-i18n.md`'s `059`/`060` claims. First-come-first-served
numbering, per `src/db/migrations/README.md`; no two tickets share a migration
file.

## Acceptance Criteria

- [ ] `publication_beta_readers` exists per the shape above via an append-only
      migration; unique on `(publication_id, user_id)`
- [ ] The owner can invite a user, and the invite grants nothing until it is
      `accepted`; revoke removes access immediately (route test asserts the
      revoked reader's read 404s)
- [ ] An `accepted` beta reader sees the publication in their publication list
      and reads it through the same viewer surface as the owner
- [ ] An `accepted` beta reader can open threads, comment, and submit
      suggestions on any `Published` unit (route tests)
- [ ] A beta reader cannot resolve threads, accept/reject/merge suggestions, pin,
      regenerate, or edit any body — each attempt returns 404 (route tests)
- [ ] A beta reader cannot see units that are not
      `PublicationStatus.Published` — the same filter the viewer enforces, not a
      second, weaker one
- [ ] No email, token, or notification machinery is added in v1
- [ ] A user with no invitation for a private publication gets 404 on every
      endpoint — viewer, threads, comments, suggestions
