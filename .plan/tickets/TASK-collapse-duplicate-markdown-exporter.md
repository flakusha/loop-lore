<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Collapse the Duplicate Markdown Exporter

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-markdown-canonical-intermediate-contract.md`, `TASK-markdown-derive-other-formats.md`, `epic-import-export-io.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

There are two markdown exporters. One is live. One is dead code. Delete the dead
one and fold any behavior it uniquely had into the live one, so exactly one
markdown serializer remains in `src/` before the derivation pipeline is built on
top of it.

## Context

**Deletion over addition.** This is the repo's own rule applied to a live
finding, and doing it first means the derivation pipeline
(`TASK-markdown-derive-other-formats.md`) has one writer to call instead of two
that have to be reconciled later.

The two:

| Function | Location | State |
| -------- | -------- | ----- |
| `formatMarkdown(chat, messages)` | `src/routes/chat-export/format.ts:30` | ✅ wired to the live route |
| `renderMarkdown(...)` | `src/chat/export/formats.ts:66` | ❌ dead — no production caller |

`src/routes/chat-export/format.ts` is the live family. `export-route.ts:96-133`
defaults to markdown — `format = (ctx.query.format as string) ?? "markdown"` —
and returns `formatMarkdown(chat, messages)` with
`Content-Type: text/markdown; charset=utf-8` and
`Content-Disposition: attachment; filename="${safeName}.md"`. Its siblings in the
same file are `formatJson`, `formatHtml`, and `formatPlainText`.

`src/chat/export/formats.ts` self-documents the duplication at `:61-63`. Its
only importers are its own test and `docs/spec/import-export-io.md`. No route,
service, or frontend module imports `renderMarkdown`.

So the work is:

1. Diff `renderMarkdown` against `formatMarkdown`. If the dead copy has a
   behavior the live one lacks, port it; if not, the live one already wins and
   nothing is ported. Do not "improve" the live writer while deleting the dead
   one — that is a different ticket.
2. Delete `renderMarkdown` and, if nothing else in
   `src/chat/export/formats.ts` is reachable, the dead module.
3. Repoint its test at the live `formatMarkdown` (or delete the test if it only
   tested the dead copy — a test that no longer has a subject is not a test).
4. Update `docs/spec/import-export-io.md`, which cites the dead path, to cite
   `src/routes/chat-export/format.ts`.

Note for the implementer: `src/routes/chat-export.ts` and
`src/routes/export-sse.ts` are **directories**, not flat files — `chat-export/`
holds `format.ts`, `export-route.ts`, `index.ts`. Some pre-existing plan prose
cites them as flat `.ts` files; that is wrong and should not be copied.

This ticket must land before `TASK-markdown-derive-other-formats.md`: EPUB/PDF/
HTML are derived from the canonical markdown, and "the canonical markdown
serializer" has to name exactly one function when that lands.

## Acceptance Criteria

- [ ] `renderMarkdown` no longer exists anywhere in `src/` — verified by a grep
      for the identifier returning no production hit
- [ ] `src/chat/export/formats.ts` is deleted if, and only if, no remaining
      export in it has a caller; any surviving export is named in the commit
      message with its caller
- [ ] `formatMarkdown` at `src/routes/chat-export/format.ts:30` is the only
      markdown serializer for chat, and `GET /api/chats/:id/export` with no
      `format` query parameter still returns `text/markdown` (route test)
- [ ] Any behavior uniquely present in the dead copy is present in the live one,
      with a test covering it; the commit message or the PR body records whether
      anything was ported or nothing was
- [ ] The dead copy's test is either repointed at `formatMarkdown` or deleted;
      there is no test importing a deleted function and `bun test` passes
- [ ] `docs/spec/import-export-io.md` cites `src/routes/chat-export/format.ts`
      and no longer cites `src/chat/export/formats.ts`
- [ ] No production code imports a module that no longer exists — `bun run typecheck`
      and `bun run lint` pass