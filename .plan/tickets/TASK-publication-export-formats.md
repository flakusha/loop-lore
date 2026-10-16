<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publication Export — EPUB / PDF / Markdown / Image-Sequence Zip

**Status:** Not Started
**Priority:** low
**Effort:** Large
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-publication-viewer-read-mode.md`, `TASK-comic-caption-bubble-layout.md`, `TASK-publication-artifact-schema.md`, `TASK-markdown-canonical-intermediate-contract.md`, `TASK-markdown-derive-other-formats.md`, `TASK-markdown-heading-parse-and-import.md`, `TASK-collapse-duplicate-markdown-exporter.md`, `epic-import-export-io.md`, `epic-creative-studio.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The export phase of the epic, explicitly scoped as later work: EPUB and PDF for
books, Markdown for both, and a zipped image sequence for comics. Export renders
from the same stored layout and placement data as the viewer, so what is
exported is what was read.

**Markdown is the intermediate, not a peer output format.** The epic's
Canonical Representation: Markdown section binds markdown as the canonical
representation for both products: the unit body is markdown, and every format
here is a derivation from that markdown. EPUB and PDF do not render the
structured unit rows directly - they render the stored markdown, rendered
through `marked`. Markdown remains the format users download to hand-edit and
re-import (`TASK-markdown-heading-parse-and-import.md`), but it is upstream of
the other formats rather than alongside them.

The derivation writers themselves are owned by
`TASK-markdown-derive-other-formats.md`. This ticket owns format selection, the
accepted-unit filter, authorization, and the delivery/progress surface over
those writers.

## Context

Export is **not** a new pipeline — it is a projection of the persisted artifact.
Every format reads accepted units and panels in `position` order and reuses:

- the geometry resolver from `TASK-comic-page-panel-layout-model.md`,
- the bubble/caption renderer from `TASK-comic-caption-bubble-layout.md`,
- asset bytes through the existing asset serve path
  (`src/assets/serve-file.ts`, `src/assets/signed-url.ts`).

Export formats in this repo already have a home and a house shape — but two
different ones, and picking the wrong one is a trap.
`src/routes/export-shared/` holds `types.ts`, `helpers.ts`, `index.ts`, `finalize.ts`
and per-domain writers (`story.ts`, `chats.ts`, `characters.ts`, `worlds.ts`,
`locations.ts`, `assets.ts`) — note there is **no `format.ts`** in that directory.
That family is **ZIP-bundle shaped**: every writer returns `Promise<void>` and
writes into the required non-optional `zip: JSZip` on `ExportContext`
(`types.ts:36`).
The format-selection module lives one level over in `src/routes/chat-export/`,
which holds `format.ts` and `export-route.ts` and returns single bytes with a
`Content-Type` plus `Content-Disposition`.

Publication export follows the **second** shape for single-file formats and the
**first** for the comic image-sequence bundle — the reasoning, including why
`ExportItem.type` (`types.ts:23`) is not widened, is in
`TASK-markdown-derive-other-formats.md`. Long exports follow the existing
progress-stream pattern (`src/frontend/alpine/export-progress.ts`).

Per format:

- **Markdown** — the canonical serialization and the reference implementation:
  one file per book, `#` per chapter; for comics, one file per page with the
  caption/bubble text under an image reference. This is the byte sequence every
  other format is derived from, and the one users edit by hand.
- **EPUB** — book only, derived FROM the stored markdown: a zip container with an
  OPF package document, a spine in chapter order, and XHTML chapters whose
  bodies are the `marked` rendering of each unit's markdown. Real reflowable
  EPUB, not a PDF renamed.
- **PDF** — both products, derived FROM the stored markdown. Books flow the
  `marked` rendering of each unit's markdown; comics lay pages out using the
  stored panel rectangles.
- **Image-sequence zip** — comic only: `page-001.png`, `page-002.png`, … one file
  per page, rendered at a declared page pixel size.

Two constraints worth stating up front so the implementer does not get asked
later:

- **Rejected and deleted content never exports.** The export projection reads the
  same filter as the viewer: `publication_status = PublicationStatus.Published`
  (`src/db/enums-story/items.ts:45`) on a non-deleted artifact. An export that
  silently includes a rejected chapter is a bug.
- **Illustrated exports degrade honestly.** A book with illustrations exports
  them inline where they sit in the chapter. A book without exports as plain
  text — never as placeholder boxes for art that was never generated.

`src/story/book-compiler.ts` does not exist; it is the deferred Tier 3 task in
`epic-creative-studio.md` and this ticket does not wait on it. The Markdown
writer here is the plain-prose path that task would otherwise have provided.

## Acceptance Criteria

- [ ] Export writers follow the placement decision in
      `TASK-markdown-derive-other-formats.md` §Placement decision: the
      single-file derivation writers live in `src/routes/publication-export/`
      (`chat-export/`-shaped), while `src/routes/export-shared/` and
      `finalize.ts` are reused for the comic image-sequence bundle, where a zip
      is the deliverable. `ExportItem.type`
      (`src/routes/export-shared/types.ts:23`) is NOT widened to carry a
      publication type
- [ ] Markdown export writes one file per book (`#` per chapter) and one file per
      comic page with caption/bubble text under the image reference
- [ ] **Markdown export is byte-stable**: two consecutive exports of an unchanged
      artifact produce byte-identical output, asserted by a test that exports
      twice and compares buffers
- [ ] EPUB export produces a valid zip container with an OPF package document, a
      spine in accepted-chapter order, and XHTML chapter bodies; validated by a
      test that unzips the output and asserts the spine matches unit order
- [ ] EPUB chapter bodies are rendered FROM the stored unit markdown rather than
      from a second prose representation; a test that edits one unit's markdown
      asserts only that unit's XHTML body changes
- [ ] PDF export produces a valid PDF for both products — flowed text for books,
      stored-geometry pages for comics — asserted by a test that checks the
      output header and page count
- [ ] PDF book text is rendered FROM the stored unit markdown; a test that edits
      one unit's markdown and re-exports asserts the change appears in the output
- [ ] Image-sequence zip writes `page-001.png`, `page-002.png`, … at a declared
      page pixel size, one file per accepted page in `position` order
- [ ] Comic page rendering uses the shared layout resolver and the shared
      bubble/caption renderer; a test asserts an exported page matches the viewer
      geometry for the same publication
- [ ] Only units/panels with `publication_status = PublicationStatus.Published` are
      exported; a test asserts a rejected chapter's text and a deleted artifact's
      content appear in no format
- [ ] A book with no illustrations exports as clean plain text with no
      placeholder boxes (test)
- [ ] Owner authorization enforced on every export request; non-owners get 404
- [ ] Exports larger than the inline threshold follow the existing progress
      stream (`src/frontend/alpine/export-progress.ts`), and the endpoint is
      covered by a route test