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

| Writer | Location | State |
| ------ | -------- | ----- |
| `formatMarkdown(chat, messages)` | `src/routes/chat-export/format.ts:30` | ✅ wired to the live route |
| `renderMarkdown(payload)` | `src/chat/export/formats.ts:66` | ❌ dead — no production caller |

`src/routes/chat-export/format.ts` is the live family. `export-route.ts:96-133`
defaults to markdown — `format = (ctx.query.format as string) ?? "markdown"` —
and returns `formatMarkdown(chat, messages)` with
`Content-Type: text/markdown; charset=utf-8` and
`Content-Disposition: attachment; filename="${safeName}.md"`. Its siblings in the
same file are `formatJson`, `formatHtml`, and `formatPlainText`.

**The unit of deletion is the whole dead module, not the markdown function
alone.** `renderMarkdown` is **not exported** — it is a module-private function
registered as `md:` in the `FORMATTERS` map at `src/chat/export/formats.ts:196-201`
and reachable only through the exported `exportChat(payload, format)`
(`:210`). That module exports `exportChat`, `type ExportFormat`, and
`type ExportPayload`/`ExportChatSummary`, and supports four formats
(`"json" | "yaml" | "toml" | "md"` at `:28`).

The whole module's **only** importer is its own test,
`src/chat/export/formats.test.ts:6` — no route, service, or frontend module
imports `exportChat`. So all four formatters are equally dead. Deleting just the
markdown one would leave `json`/`yaml`/`toml` dead code behind a live-looking
export. Delete the module; do not cherry-pick a function out of it.

**Do not port the timestamp.** The dead `renderMarkdown` emits a
`> Exported from loop-lore on` line (`formats.test.ts:84` asserts it). The live
`formatMarkdown` does not. Porting that line would make the export
nondeterministic and would directly violate the byte-stability criterion in
`TASK-publication-export-formats.md` — two exports of an unchanged artifact must
be byte-identical. The live writer wins; nothing from the dead copy is ported
unless a behavior is genuinely absent AND deterministic.

So the work is:

1. Confirm `exportChat` still has no production importer after all in-flight
   branches land (`bunx knip` or an import grep). If some other branch wired it
   up, this ticket is void — stop and file the real duplication instead.
2. Delete `src/chat/export/formats.ts` and `src/chat/export/formats.test.ts`.
3. Update `docs/spec/import-export-io.md`, which cites the dead path, to cite
   `src/routes/chat-export/format.ts`.

Note for the implementer: `src/routes/chat-export.ts` and
`src/routes/export-sse.ts` are **directories**, not flat files — `chat-export/`
holds `format.ts`, `export-route.ts`, `index.ts`, and its tests live beside them
(`export-route.test.ts`). Some pre-existing plan prose cites them as flat `.ts`
files; that is wrong and should not be copied.

This ticket must land before `TASK-markdown-derive-other-formats.md`: EPUB/PDF/
HTML are derived from the canonical markdown, and "the canonical markdown
serializer" has to name exactly one function when that lands.

## Acceptance Criteria

- [ ] Pre-flight re-check: `exportChat` still has no importer outside
      `src/chat/export/formats.test.ts` at the time of deletion (import grep or
      `bunx knip`). If it does, this ticket is void and the real duplication is
      filed instead
- [ ] `src/chat/export/formats.ts` and `src/chat/export/formats.test.ts` are both
      deleted — all four dead formatters (`json`/`yaml`/`toml`/`md`), not the
      markdown one alone
- [ ] The `> Exported from loop-lore on` timestamp from the dead `renderMarkdown`
      is NOT ported; the live `formatMarkdown` output carries no timestamp, so two
      exports of an unchanged chat are byte-identical (test exports twice and
      compares buffers)
- [ ] `formatMarkdown` at `src/routes/chat-export/format.ts:30` is the only
      markdown serializer for chat, and `GET /api/chats/:id/export` with no
      `format` query parameter still returns `text/markdown` (route test)
- [ ] Any genuinely-absent, deterministic behavior in the dead copy is ported to
      `formatMarkdown` with a test; the commit message records what was ported or
      states that nothing was
- [ ] `docs/spec/import-export-io.md` cites `src/routes/chat-export/format.ts`
      and no longer cites `src/chat/export/formats.ts`
- [ ] No production code imports a deleted module — `bun run typecheck` and
      `bun run lint` pass, and `bun test` passes
- [ ] `knip` reports no new unused-export findings introduced by the deletion