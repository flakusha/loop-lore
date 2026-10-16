<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Author Suggestion Resolution Surface

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-editorial-workflow
**Related:** `TASK-inline-markdown-suggestion-model.md`, `TASK-review-thread-comment-model.md`, `TASK-book-unit-editor-review-surface.md`, `TASK-publication-artifact-versioning.md`

**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The author side of the loop: a review surface listing every open suggestion for
a publication's units, with accept / reject / merge per suggestion and a
before→after preview — built on the same htmx fragment contract as the
publication unit editor.

## Context

The frontend contract is already fixed in this repo and this ticket follows it
verbatim, as `TASK-book-unit-editor-review-surface.md` documents: full-page
shells in `src/views/*.html` served from `src/routes/views/`; server-rendered
fragments under `/dynamic/*` from `src/routes/views/plugin-dynamic.ts` which
**redirect to `/views/` when `HX-Request` is absent** — every new fragment
endpoint keeps that guard; Alpine stores under `src/frontend/alpine/` registered
in `src/frontend/alpine/index.ts`; page-level stores use the `htmx` global
(`src/frontend/pages/world-timeline-bar.ts` pattern), not an import.

What this surface shows, per unit, in one list: open threads, and within them,
suggestions with their state (`proposed`, `needs-rebase`, `accepted`,
`rejected`, `merged`). The actions:

| Action | Effect |
| ------ | ------ |
| preview | render body-with-suggestion side-by-side (before → after) from the stored `preview_body` |
| accept | apply `proposed_text` at the verified anchor; suggestion → `accepted`; unit body written through the ordinary update path |
| merge | same as accept, plus the author's own edits folded in before the write; suggestion → `merged` |
| reject | suggestion → `rejected`; unit body untouched |
| rebase | re-anchor a `needs-rebase` suggestion onto the current body before it can be applied |

Every transition goes through the suggestion state machine
(`TASK-inline-markdown-suggestion-model.md`); there is no second state vocabulary
and no column named `state` on the unit — the unit's lifecycle stays
`publicationStatusMachine` (`src/db/enums-story/items.ts:68`), and suggestions
never touch it. Rejected is terminal-per-suggestion but the suggestion row is
kept for history, mirroring how the publishing machine keeps `rejected` units
for history.

What is **not** rebuilt here: the diff renderer. A before→after side-by-side is
already planned by `TASK-admin-revisions-diff-revert.md` (an **admin** tool whose
entity list excludes publications). This ticket renders its own minimal
before/after pair from the two markdown strings it already holds — it does not
wait for that ticket, and it does not build the admin's unified-diff toggle.
`ponytail:` two panes of markdown, green/red via existing CSS classes; add
unified-diff when the admin ticket lands and its renderer can be shared.

The confirmation discipline follows the publishing editor: regenerate
confirmation renders **inline** in the surface — there is no generic
confirmation-modal machinery to reuse
(`src/frontend/creative-studio/workflow.ts` does not exist; the real command
surface is `src/assistant/commands/workflow.ts`), so accept/reject confirm by
inline preview, not a second modal pattern.

Authorization: only the publication owner (and an invited editor, if the beta-
reader invitation from `TASK-beta-reader-feedback-surface.md` grants resolution
rights — v1 default is owner-only) reaches these mutations; every endpoint
enforces it, and a non-owner gets 404.

## Acceptance Criteria

- [ ] A review shell exists at `src/views/publication-review.html` served from
      `src/routes/views/`, listing units with open threads/suggestions
- [ ] Fragments are served from `/dynamic/publications/:id/review*` via
      `src/routes/views/plugin-dynamic.ts`, each returning a 302 to `/views/`
      when `HX-Request` is absent (route tests)
- [ ] Each suggestion shows author, anchor quote, proposed text, state, and a
      before→after preview rendered from the stored `preview_body`
- [ ] Accept applies at the verified anchor and writes the unit body through the
      ordinary update path; a versioning revision row is written by
      `TASK-publication-artifact-versioning.md`'s machinery (integration test)
- [ ] Merge lets the author edit the proposed text before the write and records
      the final text
- [ ] Reject leaves the unit body byte-identical (route test asserts equality)
- [ ] A `needs-rebase` suggestion cannot be accepted until re-anchored, and the
      UI states the reason
- [ ] All unit text renders escaped through
      `src/routes/views/escape-html.ts` — never raw
- [ ] Owner authorization on every mutation endpoint; non-owner gets 404
- [ ] An Alpine store (e.g. `src/frontend/alpine/publication-review.ts`) holds
      selection + dirty state and is registered in
      `src/frontend/alpine/index.ts`
- [ ] No confirmation-modal machinery is invented; previews render inline
