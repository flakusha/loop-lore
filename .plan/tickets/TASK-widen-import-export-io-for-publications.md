<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Widen Import/Export Epic Scope to Publications + Markdown Import

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-markdown-heading-parse-and-import.md`, `TASK-markdown-derive-other-formats.md`, `TASK-collapse-duplicate-markdown-exporter.md`, `epic-import-export-io.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

`epic-import-export-io.md` is closed as **Done** and does not know that
publications exist or that markdown is an *input* format. Widen its scope so the
Done epic is not silently contradicted by the markdown canonical-intermediate
binding.

## Context

A Done epic that claims completeness is a factual claim about the repo, and the
markdown binding falsifies part of it. `epic-import-export-io.md` records:

- `**Status:** Done` (`:9`), `**Status Note:** updated 2026-07-30 — code audit`
  (`:10`)
- `## Summary` (`:16-18`) — "Character and chat import/export system —
  auto-detection, format normalizers, exporters, PNG steganography, CHARX
  bundles, and chat export. **Core system fully implemented.**"
- The Chat Export table (`:70-78`) lists Markdown export as ✅ Done, citing
  `src/routes/chat-export.ts` (323L)
- `## Tasks` (`:100-110`) with `- [x] Chat export (Markdown, JSON, HTML, plain
  text)`

Two things are now true that it does not say.

**1. Markdown is an input format, and the epic's Remaining Work checklist has
markdown nowhere.** `## Remaining Work` (`:92-98`) lists URL import from Chub.ai,
CLI commands, and bulk ZIP export. Markdown import — the direction the canonical
binding depends on for the round trip — is absent, because markdown was only ever
an *output* here. `src/routes/import/handle.ts:139-143` dispatches CHARX then
`importFromStandard` (PNG/JSON/YAML/TOML); the file picker at
`src/components/modals/settings.html:172` is `accept="application/json"` only.
The markdown importer is `TASK-markdown-heading-parse-and-import.md`; this ticket
is the record that the Done epic needed to be reopened to receive it.

**2. The chat-export citations are wrong and the markdown writer is duplicated.**
`src/routes/chat-export.ts` is a **directory**, not a 323-line flat file — it holds
`format.ts`, `export-route.ts`, `index.ts`, and `export-route.test.ts` beside them.
And the export table names one markdown writer where the source had two:
`src/routes/chat-export/format.ts:30` `formatMarkdown` (live) and
`src/chat/export/formats.ts:66` `renderMarkdown` (dead — module-private, reached
only via the exported `exportChat` at `:210`, whose sole importer is its own
test). `TASK-collapse-duplicate-markdown-exporter.md` removes the whole dead
module and corrects this table.

**Scope of this ticket is documentation and epic state only.** No code lands here.
What changes:

- `epic-import-export-io.md` status and status note reflect the reopen: the
  markdown-import work item exists and its remaining-work checklist names it.
- The Chat Export table cites `src/routes/chat-export/` (directory) rather than a
  flat `src/routes/chat-export.ts`, and the markdown row names
  `src/routes/chat-export/format.ts` `formatMarkdown`.
- A line notes that publications and markdown are handled by
  `epic-narrative-publishing-workflows.md`, so a future reader does not file
  publication export here.
- `docs/spec/import-export-io.md` (or `docs/spec/io-formats.md`, the spec the epic
  points at) lists markdown as both an output and an accepted input format.

Regenerated plan artifacts (`.plan/feature-matrix.md`, `.plan/code-map.json`) are
refreshed with `bun run plan:docs`, `bun run plan:matrix`, and `bun run plan:map`
after the prose edits — not hand-edited.

## Acceptance Criteria

- [ ] `epic-import-export-io.md` no longer reads unqualified `**Status:** Done`;
      the status note records the 2026-10-16 reopen and why (markdown as an
      input format, publications out of its scope)
- [ ] `## Remaining Work` in `epic-import-export-io.md` names markdown import and
      links `TASK-markdown-heading-parse-and-import.md`
- [ ] The Chat Export table cites the directory `src/routes/chat-export/` and the
      `format.ts` module, not a flat `src/routes/chat-export.ts` (323L)
- [ ] The markdown row names `formatMarkdown` at
      `src/routes/chat-export/format.ts:30` as the single live markdown writer
- [ ] The epic's `## Summary` names publications as belonging to
      `epic-narrative-publishing-workflows.md` rather than to this epic
- [ ] `docs/spec/import-export-io.md` lists markdown as an accepted input format
      and cites the markdown importer route
- [ ] `bun run plan:docs`, `bun run plan:matrix`, and `bun run plan:map` have been
      run and their `--check` gates pass; `.plan/feature-matrix.md` and
      `.plan/code-map.json` are regenerated, not hand-edited
- [ ] No code change ships in this ticket — the diff touches only `.plan/` and
      `docs/`