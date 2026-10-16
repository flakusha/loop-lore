<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: LLM Authors Markdown Documents, Not Fenced JSON

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-markdown-canonical-intermediate-contract.md`, `TASK-book-outline-generation-workflow.md`, `TASK-comic-storyboard-panel-generation-workflow.md`, `TASK-markdown-heading-parse-and-import.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Prose generation stops asking for prose inside a JSON field. The LLM is asked
for a **markdown document** and the document is stored verbatim as the unit
body. Structured control data — which page, which panel, which dispatch — keeps
its existing fenced/JSON envelope.

## Context

The canonical-markdown binding has a producer end. If the model writes
`{"chapter": "...prose..."}` and the code strips the fence, the result is prose
that escaped a string literal — hard for the model to structure internally, hard
for a human to hand-edit downstream, and one more parse step between the model
and the canonical representation. Markdown is native to the model; JSON prose is
not.

**Today every narrative prompt asks for prose inside a structure.** The
registry prompt at `src/prompts/registry.ts:39-40`, the GM decision prompt at
`src/story/gm/decisions/llm.ts:55`, and the VN story prompt at
`src/routes/vn-generate/story.ts:77` ("Write 2-4 paragraphs of atmospheric VN
prose"). All of them land in fenced JSON that is then unwrapped: the fence regex
at `src/memory/extraction.ts:93`, the fence strip at
`src/assistant/commands/create.ts:136-138`, and the delimiter wrapper at
`src/assistant/xml-utils.ts:30` — `WrapperFormat = "xml" | "fence" |
"sentinel"` with `wrapContent` / `wrapSection` / `escapeXml` / `getSessionNonce`.
`safeJsonParse` (`src/utils/safe-json.ts:33`) and `safeJsonStringify` (`:69`) are
the JSON utilities.

**The split this ticket makes, stated plainly:**

- **Prose is markdown, unwrapped.** A chapter, a scene, a page script, a panel
  caption. The response IS the document; it is stored as the unit body as-is,
  and it renders through the existing `marked` pipeline. No fence stripping, no
  `safeJsonParse`, no JSON string unescaping.
- **Control data keeps its structure.** Which panels exist on a page, which
  page a prompt belongs to, what to dispatch, unit counts — these are decisions,
  not prose, and they keep the existing fenced-JSON convention via the
  `src/assistant/xml-utils.ts` `wrapContent` helpers. Do not migrate those to
  markdown; markdown has no unambiguous representation for "an array of three
  panel descriptors".

So a comic storyboard step is a two-part response: a fenced JSON block naming
the pages and panels, and the markdown script text for each page. The wiring
splits on the wrapper, not on a heuristic, because `wrapContent` already emits
the boundary.

**Emoji and breaks config, so generated markdown renders as authored.** The
parser config is `marked.use({ breaks: true, gfm: true })` at
`src/frontend/chat-vendor.ts:12-15`. `breaks: true` means a single newline in the
stored body is a line break — which is what a novelist means when they press
return. `gfm: true` enables tables, strikethrough, and task lists. Two
consequences the prompt must account for:

- The client render path applies an emoji substitution before parsing
  (`src/frontend/chat-utils/render.ts:36` parses `withEmoji`). Server-side
  derivation does not, so `:shortcode:` sequences authored by the model render
  differently in the app than in an exported EPUB unless the server applies the
  same substitution. That parity is this ticket's problem, not the export
  ticket's.
- The music embed path uses a **narrower** inline allowlist
  (`src/frontend/chat/music-embed.ts:93-96`) than the general
  `SANITIZE_CONFIG` (`src/frontend/alpine/chat-utils/sanitize.ts:9-47`). Generated
  markdown that relies on an embed must not assume the general allowlist covers
  it.

No code-highlighting library exists in the repo, so prompts must not ask the
model for fenced code blocks expecting highlighted rendering.

This ticket changes prompts and the parse boundary only. Storage is
`TASK-markdown-canonical-intermediate-contract.md`; outbound formats are
`TASK-markdown-derive-other-formats.md`; inbound markdown is
`TASK-markdown-heading-parse-and-import.md`.

## Acceptance Criteria

- [ ] At least one narrative generation path (chapter prose from the
      `book-outline` template, and the page script from `comic-storyboard`)
      requests a markdown document and stores the response as the unit body with
      no fence stripping and no `safeJsonParse` on the prose path
- [ ] A generated chapter body containing `#`, `##`, a GFM table, a list, and an
      image reference is stored byte-for-byte as authored (test asserts string
      equality, not a normalized form)
- [ ] The stored generated markdown renders through the same `marked` +
      `DOMPurify.sanitize(html, SANITIZE_CONFIG)` pair as
      `src/frontend/chat-utils/render.ts:36-37`, using `SANITIZE_CONFIG` from
      `src/frontend/alpine/chat-utils/sanitize.ts:9-47`
- [ ] The prompt instructs the model that a single newline is a line break and
      that GFM tables are available, matching `marked.use({ breaks: true,
      gfm: true })` at `src/frontend/chat-vendor.ts:12-15`
- [ ] Emoji shortcode substitution applied on the generation path matches what
      the client does at `src/frontend/chat-utils/render.ts:36`; a test asserts a
      generated body containing `:shortcode:` renders identically server-side and
      client-side
- [ ] Structured control data (panel lists, page assignments, dispatch payloads)
      still uses the fenced/JSON envelope via `wrapContent` /
      `WrapperFormat` (`src/assistant/xml-utils.ts:30`); a test asserts the
      response splitter separates the structured block from the markdown prose by
      the wrapper boundary, not by a regex guess
- [ ] A response where the model omits the structured block fails with a named
      validation reason through the `safeJsonParse` (`src/utils/safe-json.ts:33`)
      convention rather than silently producing a unit with empty panels (test)
- [ ] A response where the model omits the markdown prose but supplies the
      structure fails with a named reason; no empty-bodied unit is persisted
      (test)
- [ ] The existing `src/prompts/registry.ts:39-40`, `src/story/gm/decisions/llm.ts:55`,
      and `src/routes/vn-generate/story.ts:77` prompts are each either migrated to
      markdown output or explicitly documented as remaining prose-in-structure
      with the reason
- [ ] No fence-stripping regex is added; the removed call sites are deleted
      rather than left unused
- [ ] Prompts do not request syntax-highlighted fenced code blocks; no
      highlighting dependency is added