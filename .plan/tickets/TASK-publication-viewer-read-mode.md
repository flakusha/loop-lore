<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publication Viewer — Book Read Mode + Comic Paged Reader

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-book-unit-editor-review-surface.md`, `TASK-comic-page-panel-layout-model.md`, `TASK-comic-caption-bubble-layout.md`, `TASK-publication-export-formats.md`, `epic-visual-novel-mode.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The read-only surface for both products: a scrolling read mode for books and a
paged reader for comics. This is where an artifact stops being a pile of edited
rows and becomes something a person reads end to end.

## Context

Editor and viewer are different surfaces with different rules, and the difference
is load-bearing:

- The editor exposes every unit and every state (`draft`, `review`, `rejected`,
  pinned, …). The viewer shows **only** units whose `publication_status` is
  `PublicationStatus.Published` (the UI's "accepted") on a non-deleted artifact,
  in `position` order. A rejected chapter is not "hidden behind a toggle" in
  read mode — it is absent.

  "Accepted" is the user's word for `PublicationStatus.Published`
  (`src/db/enums-story/items.ts:45`). Filter on the enum value, never on a
  literal `'accepted'` string — no such value exists in the vocabulary.
- The viewer never mutates. No edit affordance, no inline autosave, no
  regenerate button.
- Soft-deleted artifacts (`deleted_at`, from the schema ticket) 404 in the
  viewer exactly as they must.

Frontend contract, unchanged from the rest of the app: shell in `src/views/`,
served from `src/routes/views/`; fragments under `/dynamic/*` from
`src/routes/views/plugin-dynamic.ts` with the `HX-Request` redirect guard; local
state in an Alpine store under `src/frontend/alpine/` registered in
`src/frontend/alpine/index.ts`.

Reader mechanics, chosen for what this repo already has:

- **Book read mode** is a continuous scroll with chapter headings and a chapter
  jump index — `src/story/world-timeline-bar.ts`'s timeline navigation is the
  closest existing pattern for unit navigation and is worth reading before
  writing a new one.
- **Comic reader** is one page per view with next/previous, keyboard arrows, and
  a thumbnail strip. Spreading multiple pages side by side (a real spread) is
  explicitly out of scope for v1 — the page aspect ratio and the panel layout
  were designed for single-page presentation.

Images come from the asset layer via `art_asset_id` and the existing signed-URL
path (`src/assets/signed-url.ts`), not from a publication-specific image route.
Rendition sizing is owned by `epic-asset-platform-capabilities`; this surface asks
for a size, it does not build one.

The transition engine and typewriter from `src/frontend/vn/` may be reused for
optional panel-by-panel reveal, but the comic reader must work with animation
off — panel switching is an instant swap in that mode.

## Acceptance Criteria

- [ ] A viewer shell exists at `src/views/publication.html`, served from
      `src/routes/views/`, rendering a book as scrolling chapters or a comic as
      one page per view based on `publications.kind`
- [ ] Only units with `publication_status = PublicationStatus.Published` render; `draft`, `review`, and `rejected` units are absent from the read payload, verified by a route test asserting their text is not present in the response
- [ ] Units render in dense `position` order with no gaps after a deleted unit
- [ ] A comic reader supports next/previous page, keyboard arrow navigation, and
      a thumbnail strip of all pages
- [ ] Panel art is served through the existing asset path
      (`src/assets/signed-url.ts`) keyed on `art_asset_id`; no publication-specific
      image endpoint is added
- [ ] Captions and bubbles render through the shared renderer from
      `TASK-comic-caption-bubble-layout.md`, so viewer and export agree
- [ ] A viewer store (e.g. `src/frontend/alpine/publication-reader.ts`) is
      registered in `src/frontend/alpine/index.ts`
- [ ] The viewer exposes no mutation affordance — no edit, regenerate, pin, or
      accept control renders in read mode
- [ ] A soft-deleted artifact (`deleted_at` set) returns 404 in the viewer, and a
      non-owner gets 404 rather than a redirect that leaks existence
- [ ] The comic reader is fully usable with animation/reduced-motion enabled
      (instant panel swap) — no interaction depends on a transition
- [ ] Escape-safe: chapter prose renders through `src/routes/views/escape-html.ts`