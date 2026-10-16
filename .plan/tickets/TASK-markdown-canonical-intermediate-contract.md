<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Markdown Canonical Intermediate Contract + `content_format` Column

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-publication-artifact-schema.md`, `TASK-publication-artifact-versioning.md`, `TASK-book-unit-editor-review-surface.md`, `TASK-markdown-derive-other-formats.md`, `TASK-markdown-heading-parse-and-import.md`, `TASK-llm-markdown-document-prompts.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The contract that makes markdown the canonical intermediate rather than one
output format among many: a publication unit's body **is** markdown, typed by a
`content_format` column, and a human hand-edit to that body is never silently
clobbered by a regeneration of the same unit.

## Context

The epic's `## Canonical Representation: Markdown` section is the binding; this
ticket is its storage-level half. Three concrete decisions.

**1. The unit body is markdown, typed by a column.** The schema ticket's DDL
defines `publication_units` with `body?` (`TASK-publication-artifact-schema.md`).
That column is markdown text, and it gets a companion `content_format` column
carrying an enum value. The precedent is `MessageContentFormat`
(`src/db/enums-core/messages.ts:33-35`):

```ts
export const MessageContentFormat = { Markdown: "markdown" } as const;
```

with `messages.content_format` defaulting to `"markdown"`
(`src/db/schema-core.ts:750-761`). That column is a **storage classification** —
"render this client-side through the marked pipeline" — and it is single-valued.
The publication column follows the same shape and is equally single-valued
today: one canonical format per unit body. The value is not a union of
everything the export layer can emit; EPUB and PDF are *derived from* markdown
and never stored in it. Adding a second value to this union is a format-policy
decision, not a schema convenience — do not pre-add `epub`/`pdf`/`html` "for the
future".

Note also what the notes tables do **not** have: `actor_notes`
(`src/db/schema-core.ts:367-378`), `shadow_notes`
(`src/db/schema-gm.ts:17-32`), and `whitenotes` (`:34-47`) are all plain
`content: string` with no format column. Do not copy that shape for a field the
whole binding depends on being typed.

**2. What a hand edit actually touches.** Exactly one field: the unit body. A
user opens a chapter, edits the markdown, saves. That is the whole "easy to
edit and manage" surface. It touches no panel row, no `layout_json`, no position,
and no sibling unit. For a comic, the page body is markdown and the panels keep
their existing `caption` / `bubble_text` columns
(`TASK-publication-artifact-schema.md`) — the markdown is the page's script
text, not a replacement for structured panel rows.

**3. What regeneration must preserve: the human edit.** This is the part that
makes or breaks the binding. If a user hand-edits chapter 4 and then a
regeneration of chapter 4 silently overwrites it, "easy to edit" is a lie. The
safe semantics, and they are the semantics already being built:

- Regeneration is **write-then-offer, never overwrite-in-place** —
  `TASK-publication-artifact-versioning.md` writes a
  `publication_unit_revisions` row and leaves the accepted unit body untouched
  until the user keeps or discards.
- A **hand-edited unit is pinned against regeneration sweeps** until the user
  unpins it. `PinnedState` (`src/db/enums-core/flags.ts:8`) already covers
  `unpinned | pinned | archived` and the versioning ticket already rejects
  regeneration on a pinned unit and rejects a pinned unit carrying a live
  revision as a contradiction at the API boundary. This ticket's contribution
  is the marking rule: an editor save that changes the body sets the pin, so the
  edit is protected by construction rather than by the user remembering to pin.
- **Keep/discard is what resolves it.** Keeping the revision writes the new
  markdown onto the unit; discarding deletes the candidate and the hand edit
  survives byte-for-byte. The versioning ticket's discard test already asserts
  the unit is byte-identical to its pre-regeneration state.

**Round-tripping is the other half of this contract** and is not owned here:
parsing markdown back into units is
`TASK-markdown-heading-parse-and-import.md`, and rendering markdown out to
EPUB/PDF/HTML/plain text is `TASK-markdown-derive-other-formats.md`.

The library is already installed. `marked` ^18.1.1 (`package.json:174-198`) is
the only markdown parser in the repo — no remark, no markdown-it, no showdown, no
mdast/hast — configured globally by `marked.use({ breaks: true, gfm: true })`
at `src/frontend/chat-vendor.ts:12-15`. That config is the one the unit body is
authored against: a single newline in a stored unit body is a line break, and
GFM tables and strikethrough work. Nothing here introduces a second parser.

## Acceptance Criteria

- [ ] `publication_units` gains a `content_format` column whose type is an enum
      object shaped like `MessageContentFormat`
      (`src/db/enums-core/messages.ts:33-35`), defaulting to `"markdown"`, added
      by a forward migration per `src/db/migrations/README.md` (one `ADD COLUMN`
      per `alterTable` statement — SQLite limitation)
- [ ] The `content_format` union has exactly one member, `markdown`. No `epub`,
      `pdf`, or `html` member is added "for the future" — those are derived
      outputs, not stored representations
- [ ] The migration runs in isolation or as a follow-on to
      `057_publication_artifacts.ts`; it is never a co-owned file with another
      ticket. `bun run db:sync-types && bun run db:sync-manifest` has been run and
      `bun run schemas:check` passes
- [ ] A unit body is stored and read back byte-identically through the service
      layer in `src/publications/service/`; a test writes a markdown body with
      headings, a GFM table, and an image reference and reads all three back
      unchanged
- [ ] A markdown body containing a single newline between two lines renders as a
      line break in the viewer, matching `marked.use({ breaks: true })` from
      `src/frontend/chat-vendor.ts:12-15` (test)
- [ ] Saving a hand edit through the unit editor sets the unit's `pin` to
      `PinnedState.Pinned`, and a subsequent regeneration of that unit is
      rejected rather than applied (route test)
- [ ] A regeneration attempted on a pinned unit that carries a live
      `publication_unit_revisions` row is rejected at the API boundary with a
      named reason, matching `TASK-publication-artifact-versioning.md`
- [ ] Discarding a live revision leaves the hand-edited body byte-identical to its
      pre-regeneration state (test asserts equality, not length)
- [ ] A hand edit changes no sibling unit, no panel row, and no `position` (test)
- [ ] A comic page's markdown body does not overwrite or duplicate the structured
      `caption` / `bubble_text` panel columns; a test asserts a panel round-trips
      through a page-body edit unchanged
- [ ] Unpinning a hand-edited unit and regenerating it writes a revision row
      rather than overwriting, i.e. the write-then-offer path is the only path
- [ ] The markdown that leaves the unit is rendered through `marked` +
      `DOMPurify.sanitize(html, SANITIZE_CONFIG)` — the same pair as
      `src/frontend/chat-utils/render.ts:36-37`, using `SANITIZE_CONFIG` from
      `src/frontend/alpine/chat-utils/sanitize.ts:9-47`