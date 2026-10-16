<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Inline Markdown Suggestion Model

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-editorial-workflow
**Related:** `TASK-review-thread-comment-model.md`, `TASK-author-suggestion-resolution-surface.md`, `epic-narrative-publishing-workflows.md`

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Suggested edits on markdown: a reviewer selects a span of a unit's body and
proposes replacement text; the proposal is stored as a draft, previewed against
the live body, and only applied by an explicit author action.

## Context

The unit body is markdown and markdown is the source of truth — that binding is
`epic-narrative-publishing-workflows.md`'s canonical-markdown contract
(`publication_units.body`, hand-editable, regenerable). So a suggestion anchors
into **the markdown text**, not into rendered HTML. Anchoring by character
offset into rendered output would drift the moment the unit is re-rendered,
regenerated, or restyled.

The repo's parser is `marked` ^18.1.1 — the only markdown parser in the
dependency tree, configured `breaks: true, gfm: true`
(`src/frontend/chat-vendor.ts:12-15`). It renders; it does not currently expose
a walking AST (a gap `epic-narrative-publishing-workflows.md` names explicitly
and assigns to `TASK-markdown-heading-parse-and-import.md`). This ticket does
not wait for that work: v1 anchors are stored, not derived:

```
review_suggestions
  id, comment_id,
  anchor_start, anchor_end,        -- line offsets into the unit body's markdown
  anchor_text,                     -- the quoted span, verbatim, for display + verification
  proposed_text,
  state,                           -- proposed | accepted | rejected | merged
  preview_body?,                   -- the body-with-suggestion-applied, snapshot at preview time
  created_by, created_at, updated_at
```

Three decisions carried by those columns:

- **`anchor_text` is the verification key.** On preview, the current unit body
  is re-checked at `anchor_start`..`anchor_end`; if the quoted span no longer
  matches (the unit was edited since), the suggestion is marked
  `needs-rebase` and the author must re-anchor it before it can be applied. No
  silent application of a stale patch — that is how a review flow corrupts
  prose.
- **Preview is a stored draft, not an apply.** The shape to copy is
  `branch_merges`: a `draft` row with its preview payload, confirmed only by an
  explicit action (`confirmMerge` in
  `src/chat/service/merge/merge-store.ts:217-220` transitions
  `draft → confirmed`), with the result row carrying a back-reference badge
  (`messages.merge_id`, `src/db/schema-core.ts:793`). Suggestions follow the
  same preview→confirm discipline; nothing about a proposal touches the unit
  body until the author acts.
- **Applying is an ordinary body write.** Accept/merge go through the same unit
  update path a hand edit uses, so versioning
  (`TASK-publication-artifact-versioning.md`) records it like any other body
  change. No suggestion-specific write path exists.

Sanitization stays at the existing boundary: the unit body renders through the
chat render pipeline (`src/frontend/chat-utils/render.ts:36-37`, marked +
`SANITIZE_CONFIG`); `proposed_text` is stored raw and rendered through the same
pipeline, never pre-sanitized into something else.

Migration: `062_review_suggestions.ts` — after
`TASK-review-thread-target-vocabulary.md`'s `061_review_threads.ts` claim (and
after `epic-publication-i18n.md`'s `059`/`060` claims). If `061` has not landed,
this ticket owns the next number after it; no shared files, per
`src/db/migrations/README.md`.

## Acceptance Criteria

- [ ] `review_suggestions` exists per the shape above, created by an append-only
      migration per `src/db/migrations/README.md`
- [ ] A reviewer can submit a suggestion quoting a line span of a unit's
      markdown, storing `anchor_text` verbatim and writing nothing to
      `publication_units.body` (route test asserts the body is byte-identical)
- [ ] Preview renders body-with-suggestion-applied and is stored on the draft
      row; the preview never becomes the live body
- [ ] When the unit body changed since the suggestion was made, the state
      machine refuses to apply it: `needs-rebase` with the mismatch named — no
      silent re-anchoring
- [ ] Accepted and merged suggestions transition `proposed →
      accepted/merged`, and applying goes through the ordinary unit-update path
      so versioning records it (integration test with
      `TASK-publication-artifact-versioning.md`'s revision row)
- [ ] Rejected suggestions leave the unit body byte-identical (route test
      asserts equality, not just absence of change)
- [ ] `proposed_text` is stored unsanitized and rendered through the existing
      marked + `SANITIZE_CONFIG` path only
- [ ] The draft→confirm shape follows `branch_merges`' discipline; no
      auto-apply path exists in code (asserted by review of the write callers)
