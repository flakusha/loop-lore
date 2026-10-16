<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Markdown Heading Parse + Markdown Importer (the round-trip half)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-markdown-canonical-intermediate-contract.md`, `TASK-markdown-derive-other-formats.md`, `TASK-widen-import-export-io-for-publications.md`, `epic-import-export-io.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The direction the epic already has an export for and no import: a markdown
document authored anywhere becomes publication units (book chapters) or pages
(comic scripts) inside the app. Two pieces — a markdown→AST walker built on a
`marked` tokenizer, and an importer route that turns a markdown file into units
and pages.

## Context

This is the round-trip half of the canonical-markdown binding. The export half
already ships for chats (`src/routes/chat-export/export-route.ts:96-133`,
markdown is the default format) and is specified for publications in
`TASK-publication-export-formats.md`. **Nothing accepts markdown on the way in.**

**There is no importer that takes markdown today.** `src/routes/import/handle.ts:139-143`
dispatches CHARX (zip magic bytes) and then `importFromStandard`, which handles
PNG / JSON / YAML / TOML. `src/routes/import/lorebook.ts` takes an
*already-parsed* `LorebookData`, not text. `src/routes/world-import/bundle.ts`
takes a JSON `WorldBundle`. The normalizers under
`src/characters/normalizers/` (`ccv2.ts`, `ccv3.ts`, `character-ai.ts`,
`json-flat.ts`, `toml.ts`, `yaml.ts`) all take structured input. The file picker
at `src/components/modals/settings.html:172` offers `accept="application/json"`
only. SillyTavern `.jsonl` / `.txt` import does not exist (only the deferred
`TASK-url-import-chub.md`), and `TASK-text-to-visual-novel-importer` is not a
real file. So the "edit the markdown in vim, import it back" loop the binding
promises has no half to land on until this ticket.

**There is no markdown→AST path today.** `marked` ^18.1.1 (`package.json:174-198`)
is the only markdown parser in the repo — no remark, no markdown-it, no showdown,
no mdast, no hast, no shiki. It is used strictly as a renderer: the client calls
`marked.parse(withEmoji)` at `src/frontend/chat-utils/render.ts:36`, and the
server exposes `markedParse: (src, opts) => marked.parse(src, opts ?? {}) as
string` at `src/generation/auto-gen/deps.ts:81`. Nothing walks tokens, and no
AST object is retained. A heading/section walker therefore has to be built as a
custom `marked` extension/tokenizer — the walk is over tokens, not over a
pre-built AST type. Do not add `remark`/`unified`/`mdast-util-from-markdown`
to get a typed tree; the token walk is sufficient for splitting a document on
headings, and it is the smaller dependency surface.

Config note: the global `marked.use({ breaks: true, gfm: true })` at
`src/frontend/chat-vendor.ts:12-15` is installed in the **browser** bundle. The
server-side parser used here must apply the same options explicitly so a document
parses identically on the import path and on the render path — otherwise a
round trip through import and back out to HTML changes the document.

Error handling follows the repo's existing convention rather than a new shape:
`safeJsonParse` (`src/utils/safe-json.ts:33`) and `safeJsonStringify` (`:69`) are
the model — a malformed input returns a typed failure, never a thrown generic
error and never a partial import. A markdown document that yields no units (no
headings, empty body) is a validation failure at the route boundary with a named
reason, not an empty publication.

Suggested module: `src/routes/import/markdown.ts`, dispatched from
`handle.ts` on a `.md` / `.markdown` extension ahead of the zip-magic branch,
reusing the existing import route family rather than adding a second upload
surface. The destination is publication units in `position` order — `## Heading`
(and deeper) is a unit boundary for a book; for a comic, a page boundary is the
convention this ticket must state and test, and per-panel caption text within a
page section maps onto the structured `caption` / `bubble_text` panel columns
owned by `TASK-publication-artifact-schema.md`.

The `epic-import-export-io.md` scope widening
(`TASK-widen-import-export-io-for-publications.md`) should land alongside this
ticket: that epic is **Status: Done** and its remaining-work checklist has
markdown nowhere — it lists markdown only as a shipped chat *export*
(`:74`, `:110`).

## Acceptance Criteria

- [ ] A markdown→token walker is implemented as a `marked` extension/tokenizer,
      reusing the installed `marked`; no `remark`, `markdown-it`, `showdown`,
      `mdast`, `hast`, or `shiki` dependency is added to `package.json`
- [ ] The tokenizer splits a document on `##`/`###` headings into ordered
      sections, preserving heading level and order; a test asserts a fixture
      with three `##` sections yields exactly three sections in source order
- [ ] Server-side parsing applies the same `{ breaks: true, gfm: true }` options as
      `src/frontend/chat-vendor.ts:12-15`; a test asserts a GFM table and a
      single-newline line break parse identically through the import path and
      through `marked.parse`
- [ ] `src/routes/import/markdown.ts` accepts a `.md` / `.markdown` upload and
      creates publication units in `position` order with the document's heading
      text as the unit title and the section body as the unit's markdown body
      (route test)
- [ ] The markdown branch is dispatched from `src/routes/import/handle.ts`
      before `importFromStandard`, and does not collide with the CHARX zip-magic
      branch
- [ ] The import file picker at `src/components/modals/settings.html:172`
      accepts `.md` / `.markdown` alongside the formats it already offers
- [ ] Owner authorization is enforced on markdown import; a non-owner gets 404
- [ ] A document with no headings and an empty body is rejected with a named
      validation reason; no empty publication is created (route test)
- [ ] A malformed input produces a typed failure returned through the
      `safeJsonParse` (`src/utils/safe-json.ts:33`) convention — no partial unit
      rows are written when the document fails mid-parse (test)
- [ ] Round trip: a publication exported to markdown
      (`TASK-publication-export-formats.md`) and re-imported produces the same
      ordered unit titles and the same bodies (test)
- [ ] For a comic, a page section maps to a page unit and its panel captions map
      onto `publication_panels.caption` / `bubble_text`; a test asserts panel
      positions are dense and ordered
- [ ] `docs/spec/import-export-io.md` documents markdown import as an accepted
      input format alongside the shipped chat export