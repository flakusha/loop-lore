<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Narrative Publishing Workflows (Books & Comics)

**Overview:** Assistant-driven production of long-form narrative artifacts — chaptered
books and paged comics — as first-class persisted artifacts with ordered units,
optional illustration passes, per-unit regeneration, and export. Text tiers come
first; illustrated tiers are an optional pass over an already-persisted text
artifact, not a second pipeline.

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** publishing, book, comic, workflow-templates, assistant, assets, export

## Summary

One pipeline produces two output products from chat and creation flows:

- **book** — ordered chapters/scenes, each with prose
- **comic** — ordered pages, each containing ordered panels (art asset +
  caption + optional bubble text)

Each product has two rendering tiers:

- **text-only** — the artifact is the deliverable
- **text + illustrated** — a second pass dispatches image generation over the
  text artifact, reusing the ComfyUI / sd.cpp generation path and
  reference-conditioned editing for character consistency

Both products are driven by the existing assistant workflow-template harness
(`src/assistant/workflow-runner.ts`, `src/assistant/workflow-routing.ts`,
`configs/templates/workflows/*.yaml`). No new template DSL is introduced.

## Overview

Today the repo can generate *turns* of prose in chat (`epic-story-mode-ui`,
`epic-assistant-gm-flows`) and can generate *images* via ComfyUI/sd.cpp
(`epic-comfyui-plugin`). What does not exist is anything in between: there is no
artifact that survives across turns, no unit boundary (chapter, page), no place
to hang generated art, no per-unit regeneration, and no export of the result as
a book or a comic. The one adjacent artifact — the Creative Studio "Book
compilation" task (`src/story/book-compiler.ts`, listed under "Out of MVP" in
`epic-creative-studio.md`) — does not exist in `src/` and covers none of the
structure below.

This epic fills that gap. The unit of work is the **publication artifact**: a
persisted, ordered collection of units, each of which is regenerable,
reviewable, and (for comics) illustrated.

### Verified ground state (2026-10-16)

| Component | Status | Location |
| --------- | ------ | -------- |
| Workflow template schema | ✅ Shipped | `src/config/sections/templates-workflow.ts` (`AssistantWorkflowConfig`, `WorkflowStepConfig`, `WorkflowDispatchConfig`, `WorkflowApprovalConfig`, `EntityTypePreset`) |
| Workflow template loader | ✅ Shipped | `src/config/templates-loader/` — a **directory**: `index.ts` is the entry, `discovery.ts` finds the files |
| Workflow runner (start/preview/step/confirm/dispatch) | ✅ Shipped | `src/assistant/workflow-runner.ts` |
| Intent routing | ✅ Shipped | `src/assistant/workflow-routing.ts:94` (`matchWorkflowIntent` → `INTENT_PATTERNS`) |
| Workflow command surface | ✅ Shipped | `src/assistant/commands/workflow.ts`, mounted at `src/routes/messages/command.ts` |
| Workflow templates on disk | ✅ 3 files | `configs/templates/workflows/{entities,entity-types,defaults}.yaml` |
| Quality gates | ⚠️ Partial | `ENTITY_QUALITY_GATES = ["schema","consistency","duplicate"]` (`src/config/sections/templates-workflow.ts:82`), validated by `validateEntityTypeConfig` (`src/config/templates-loader/validation-entity-types.ts`). Gates are declared on `EntityTypePreset.qualityGates`, **not** on `WorkflowApprovalConfig` |
| Comic / manga / webtoon / speech-bubble concept | ❌ Absent (before this epic) | No **pre-existing** ticket or epic proposes comics / manga / webtoon / speech bubbles as a product, and nothing in `src/` implements one. Every occurrence of those terms in `.plan/` today is downstream of this epic: this file and its own tickets, the cross-reference from `epic-reference-conditioned-generation.md:252-253`, and the regenerated `.plan/feature-matrix.md` / `.plan/code-map.json`, whose `comic` row resolves solely to `EPIC-NARRATIVE-PUBLISHING-WORKFLOWS` (this epic's own `Tags`). (`storyboard` appears twice in `epic-vector-graphics-generation.md:114,145` in an unrelated img2vid sense; `panel` appears only in generic UI senses, e.g. "GM Panel Layout" in `epic-story-mode-ui.md:83`.) |
| Publication artifact model | ❌ Absent | No `publications*` table in `src/db/schema-*.ts` |
| Publication lifecycle vocabulary | ✅ Exists — **reuse it** | `PublicationStatus` (`src/db/enums-story/items.ts:45`) + `publicationStatusMachine` (`:68`) already model `draft → review → published/rejected → archived` with a guarded transition table, applied to `worlds` and `locations` (`src/db/schema-story.ts:58,138`). `PinnedState` (`src/db/enums-core/flags.ts:8`) covers `unpinned/pinned/archived` |
| Book compiler | ❌ Absent | `src/story/book-compiler.ts` does not exist (`epic-creative-studio.md` Tier 3) |
| Reference-conditioned edit templates | ❌ Open | FLUX.1 Kontext / Qwen Image Edit / Krea 2 templates under `epic-comfyui-plugin` |
| Asset layer | ✅ Shipped | `src/assets/service/create.ts` (`createAsset`), `src/assets/service/links.ts` (`linkAsset`), `assets` + `asset_links` (`src/db/schema-content.ts`) |
| VN scene/layout machinery | ✅ Shipped | `src/frontend/vn/scene-renderer/`, `src/frontend/vn/sprite-stage.ts` |
| Story quality scorers | ✅ Shipped | `src/story/quality-evaluator.ts`, `src/story/quality/scorers/*.ts` |

### Correction to the template schema

`epic-assistant-creative-studio-workflows.md` §7.1 shows an
`approval.quality_gates` block. The landed type does not have it:
`WorkflowApprovalConfig` is `{ type: "confirm" | "auto"; preview?: boolean }`
(`src/config/sections/templates-workflow.ts:55-58`). Quality gates are declared
per entity-type preset in `entity-types.yaml` and cross-validated at load time.
This epic's templates therefore declare gates through the preset mechanism, and
`TASK-publication-art-quality-gates.md` carries the work of widening the gate set
to image-shaped checks. No epic file is edited to reconcile the §7.1 example;
that drift is recorded here.

## Scope

### Artifact model

A first-class persisted artifact with ordered units.

| Product | Unit | Contents |
| ------- | ---- | -------- |
| book | chapter / scene | ordered prose |
| comic | page | ordered panels; each panel = art asset id + caption + optional bubble text |

Artifact relation to the existing `story` machinery:

- `story_turns` (`src/db/schema-story.ts:186`) and `src/story/game-master/` own
  **live, chat-scoped turn generation**. A publication is not a chat: it has a
  lifetime independent of any session, an explicit unit order, and its own
  regeneration path.
- A publication may be **seeded from** a chat or a GM-guided session (units
  imported from turns), and may **export back** to a shareable format, but it
  never becomes `story_turns` and never mutates them.
- Neither `story_turns` nor any story table is altered by this epic.

### Workflow templates

Four templates under `configs/templates/workflows/`, all reusing the shipped
schema (`intent`, `steps`, `dispatch`, `approval`):

| Template id | Tier | Shape |
| ----------- | ---- | ----- |
| `book-outline` | text-only | premise → arc → chapter list → prose, persisted as units |
| `book-illustrate` | illustrated | per-chapter illustration set, reference-conditioned |
| `comic-storyboard` | illustrated | script → page/panel list with prompts + captions, then art dispatch |
| `comic-bubbles` | illustrated | per-panel bubble/caption placement pass over generated art |

The two illustrated templates consume a **reference set** built from prior
panels/illustrations of the same publication so that characters look like the
same characters. That dependency is the reference-conditioned edit templates
under `epic-comfyui-plugin` (FLUX.1 Kontext / Qwen Image Edit / Krea 2); this
epic depends on those landing, and does not own them.

### Review and iterate

- Per-unit regenerate (one unit, not the whole artifact)
- Pin / accept / reject per unit
- Continuity quality gates across units
- Export: epub, pdf, markdown, image-sequence zip — explicitly a later phase
  inside this epic, not v1

## Design

### Artifact shape (illustrative — the migration ticket owns the final DDL)

```
publications
  id, owner_id, title, kind ("book" | "comic"),
  status PublicationStatus,     -- REUSE src/db/enums-story/items.ts:45
  source_chat_id?, created_at, updated_at, deleted_at, data_version

publication_units          -- ordered; a chapter for a book, a page for a comic
  id, publication_id, position, title?, body?   -- prose (book) / page notes (comic)
  publication_status PublicationStatus,         -- per-unit draft/review/published/rejected
  pin PinnedState                               -- REUSE src/db/enums-core/flags.ts:8

publication_panels         -- comic only; ordered within a unit
  id, publication_id, unit_id, position,
  art_asset_id?, caption?, bubble_text?, layout_json?,
  publication_status PublicationStatus, pin PinnedState
```

Panels reference art through `art_asset_id` → `assets.id`
(`src/db/schema-content.ts:37`) plus a polymorphic `asset_links` row
(`asset_links` at `src/db/schema-content.ts:17`, entity vocabulary at
`src/db/enums-content.ts:73`) rather than duplicating blob metadata. Soft delete
is `deleted_at` on the artifact, consistent with the moderation tables.

### Reuse, not reinvention

- A comic page is conceptually a **laid-out VN scene plus caption/bubble
  layers**. `src/frontend/vn/sprite-stage.ts` already solves anchored,
  z-ordered placement; `src/frontend/vn/scene-renderer/` already solves
  transition and typewriter pacing. The comic authoring surface reuses those
  placement primitives rather than writing a second layout engine.
- Chapter prose generation reuses `src/story/quality-evaluator.ts` and
  `src/story/quality/scorers/*` for continuity checks rather than writing new
  scorers.
- Asset creation reuses `createAsset` / `linkAsset` (`src/assets/service/`)
  rather than writing a publication-specific blob path.
- Export reuses the export route family under `src/routes/export-shared/`
  (including `story.ts`) rather than inventing a delivery pipeline.

### Non-goals

- No public publishing, no share links to the public internet, no upload to any
  distribution platform
- No marketplace or store
- No print-on-demand, no trim-size / bleed / CMYK pipeline
- No video, no motion comics, no animated panels
- No new workflow-template DSL, no new intent taxonomy beyond
  `AssistantIntent` in `src/regex/intent.ts`
- No change to `story_turns` or to the live story-mode generation loop

## Canonical Representation: Markdown

Markdown is the **canonical intermediate** for both products. It is not one
export format among many. The shape of the binding:

- The LLM **writes** markdown. A unit's prose is authored as a markdown document,
  not as a JSON string field a human has to hand-splice.
- A human **hand-edits** markdown directly. What they edit is the unit body field
  (`publication_units.body`) — a plain markdown string, editable in any text
  editor without touching structured internals. What must survive a
  regeneration of that unit is the human's edit: the pin/accept semantics that
  make it safe are owned by `TASK-markdown-canonical-intermediate-contract.md`,
  and the keep-or-discard revision row that backs it by
  `TASK-publication-artifact-versioning.md`.
- Every **output format derives** from the markdown: EPUB, PDF, HTML, plain text,
  and the comic page image sequence are projections of the same markdown, not
  independent renderers over structured rows.

That is the "easy to edit and manage" property made concrete: one
human-editable field, one canonical serialization, N derived outputs.

### Grounding in verified state (2026-10-16)

The machinery is already installed; this binding wires it into publishing rather
than introducing a dependency.

| Piece | Status | Location |
| ----- | ------ | -------- |
| Markdown parser | ✅ Shipped | `marked` ^18.1.1 (`package.json:174-198`) — the **only** markdown parser; no remark / markdown-it / showdown / mdast / hast / shiki anywhere |
| HTML sanitizer | ✅ Shipped | `dompurify` ^3.4.17 |
| Parser config | ✅ Shipped | `marked.use({ breaks: true, gfm: true })` — `src/frontend/chat-vendor.ts:12-15`, declared `src/frontend/loaders.d.ts:118-119` |
| Sanitize allowlist | ✅ Shipped | `SANITIZE_CONFIG` — `src/frontend/alpine/chat-utils/sanitize.ts:9-47`; applied at `src/frontend/chat-utils/render.ts:37` and `src/frontend/alpine/chat-generations.ts:213` |
| Render paths | ✅ Shipped | client DOM `src/frontend/chat-utils/render.ts:36-37`; server SSE `markedParse` `src/generation/auto-gen/deps.ts:81` (injected into `GenDeps` at `:53`, wired `call-llm.ts:208,257`, `post-store.ts:187`) |
| Format-column precedent | ✅ Exists | `MessageContentFormat` `src/db/enums-core/messages.ts:33-35`; `messages.content_format` defaults to `"markdown"` (`src/db/schema-core.ts:750-761`) |
| Markdown export | ✅ Already ships | default format of `GET /api/chats/:id/export` — `src/routes/chat-export/export-route.ts:96-133`, served by `formatMarkdown` `src/routes/chat-export/format.ts:30` |
| Zip engine | ✅ Installed | `jszip` ^3.10.2 — the only writer engine present |

`MessageContentFormat` is the model to follow for a publication format column.
Note what it is: a **storage classification** meaning "render this client-side
through the marked pipeline". It is not a document interchange contract, and a
publication format enum is a different thing with a different job.

### The four gaps this binding creates

1. **No markdown→AST path.** `marked` is render-only here — there is no tokenizer
   exposed and no AST object to walk. Heading/section walking (chapter
   boundaries, page boundaries, panel captions inside a comic script) needs a
   custom `marked` extension/tokenizer, owned by
   `TASK-markdown-heading-parse-and-import.md`.
2. **No importer accepts markdown.** `src/routes/import/handle.ts:139-143`
   dispatches CHARX (zip magic) then `importFromStandard` → PNG/JSON/YAML/TOML;
   the file picker at `src/components/modals/settings.html:172` offers
   `accept="application/json"` only. SillyTavern `.jsonl`/`.txt` import does not
   exist. The round-trip half — author in any markdown editor, import back — has
   no route.
3. **No EPUB/PDF/DOCX writer exists at all.** Every `application/pdf` hit in
   `src/` is an upload-validation MIME allowlist
   (`src/assets/service/detect.ts:39`, `src/assets/service/validate.ts:23`) and
   the gallery rejects PDF. No `text/epub`, no `application/epub+zip`, no
   pdfkit/jsPDF, no pandoc invocation, no DOCX library. This is greenfield.
4. **The markdown exporter is duplicated.** `src/routes/chat-export/format.ts:30`
   `formatMarkdown()` is wired to the live route; `src/chat/export/formats.ts:66`
   `renderMarkdown()` is dead code with no production caller. It is module-private,
   reachable only through the exported `exportChat` (`:210`), whose sole importer
   is its own test — so the whole four-format module (`json`/`yaml`/`toml`/`md`,
   `:28`) is dead, not just the markdown formatter. It is collapsed first —
   `TASK-collapse-duplicate-markdown-exporter.md`.

### Hazard: the SSE path emits unsanitized HTML

`markedParse` (`src/generation/auto-gen/deps.ts:81`) ships `marked.parse()`
output to the client **unsanitized** and relies on the client to sanitize on
render. That is safe today because the bytes never leave as a file. Any
server-side HTML export that reuses `markedParse` would emit a downloadable HTML
file bypassing DOMPurify entirely. Server-side HTML derivation must sanitize
through `SANITIZE_CONFIG` (`src/frontend/alpine/chat-utils/sanitize.ts:9-47`)
before the bytes are written, and the frontend gate
`src/scripts/check-frontend-innerhtml-xss.ts` — which reasons about client-side
rendering — must not be assumed to cover a server-side writer.

### Relationship to `TASK-publication-export-formats.md`

That ticket treats markdown as one **output** format alongside EPUB and PDF. This
binding promotes it to the **intermediate** all three derive from. It is not
duplicated: the export ticket keeps ownership of format selection, accepted-unit
filters, authorization, and the progress stream; the tickets under this section
own the canonical contract, the parse/import direction, and the derivation
pipeline.

## Tasks

- [ ] `TASK-publication-artifact-schema.md` — publication / unit / panel tables + migration
- [ ] `TASK-book-outline-generation-workflow.md` — text-only book workflow template + runner wiring
- [ ] `TASK-book-unit-editor-review-surface.md` — book unit editor, regenerate/pin/accept
- [ ] `TASK-comic-page-panel-layout-model.md` — page/panel layout model + authoring surface
- [ ] `TASK-comic-storyboard-panel-generation-workflow.md` — LLM storyboard → art dispatch
- [ ] `TASK-illustrated-book-reference-pass.md` — illustrated-book pass with reference conditioning
- [ ] `TASK-publication-art-quality-gates.md` — panel/book art gates + character consistency
- [ ] `TASK-comic-caption-bubble-layout.md` — captions and speech-bubble layout + rendering
- [ ] `TASK-publication-viewer-read-mode.md` — read mode (book) and paged reader (comic)
- [ ] `TASK-publication-export-formats.md` — epub / pdf / markdown / image-sequence zip
- [ ] `TASK-publication-continuity-lint.md` — cross-unit continuity lint
- [ ] `TASK-publication-artifact-versioning.md` — versioning / keep-or-discard regeneration
- [ ] `TASK-collapse-duplicate-markdown-exporter.md` — delete the dead `renderMarkdown` copy, fold into the live `formatMarkdown`
- [ ] `TASK-markdown-canonical-intermediate-contract.md` — unit body IS markdown; `content_format` column; hand-edit vs regenerate safety
- [ ] `TASK-markdown-heading-parse-and-import.md` — markdown→AST tokenizer + markdown importer (round-trip)
- [ ] `TASK-markdown-derive-other-formats.md` — markdown → EPUB / PDF / HTML / plain text
- [ ] `TASK-llm-markdown-document-prompts.md` — the LLM authors markdown documents, not fenced JSON
- [ ] `TASK-widen-import-export-io-for-publications.md` — widen the Done import/export epic to publications + markdown import

## Dependencies

- `epic-assistant-creative-studio-workflows.md` — workflow template schema, loader,
  runner, intent routing. Everything here is an instantiation of that harness.
- `epic-comfyui-plugin.md` — ComfyUI / sd.cpp backends and the reference-conditioned
  edit templates (FLUX.1 Kontext, Qwen Image Edit, Krea 2) that character
  consistency depends on. Those templates are owned there, not here.
- `epic-assistant-gm-flows.md` — GM-guided story creation and the quality-gate /
  confirmation pattern reused for publication generation.
- `epic-asset-platform-capabilities.md` — asset creation, links, renditions, gallery.
- `epic-visual-novel-mode.md` — scene layout, sprite anchoring, transitions, template
  engine. A comic page reuses these placement primitives.
- `epic-creative-studio.md` — the deferred Tier 3 "Book compilation" task
  (`src/story/book-compiler.ts`); this epic supersedes its scope and that task
  is the plain-prose export path.
- `epic-import-export-io.md` — existing import/export + format-normalizer family
  under `src/routes/export-shared/` and `src/routes/chat-export/` that export
  extends rather than duplicates. That epic is **Status: Done** and its shipped
  checklist names markdown only as a chat *export* format (`:74`, `:110`) with no
  mention of markdown import or of publications at all. Its scope therefore has
  to be widened before the round-trip half of this binding can land — that is
  `TASK-widen-import-export-io-for-publications.md`.

## Related Epics

- `epic-assistant-creative-studio-workflows.md`
- `epic-comfyui-plugin.md`
- `epic-assistant-gm-flows.md`
- `epic-asset-platform-capabilities.md`
- `epic-visual-novel-mode.md`
- `epic-creative-studio.md`
- `epic-import-export-io.md`
- `epic-story-mode-ui.md`

## Acceptance Criteria

- [ ] A publication unit's body is stored as markdown and typed with a
      `content_format` column modelled on `MessageContentFormat`
      (`src/db/enums-core/messages.ts:33-35`); no prose-plaintext and
      prose-markdown split path exists
- [ ] A human can hand-edit a unit's markdown body and that edit survives the
      next regeneration of that unit unless the user explicitly accepts the new
      candidate
- [ ] Every output format (EPUB, PDF, HTML, plain text, comic page image
      sequence) is derived from the stored markdown; none re-renders prose from a
      different source of truth
- [ ] A markdown document authored outside the app can be imported back into
      publication units/pages
- [ ] Server-side HTML derivation sanitizes through `SANITIZE_CONFIG`; the
      unsanitized SSE `markedParse` path (`src/generation/auto-gen/deps.ts:81`) is
      never used to produce a downloadable file
- [ ] Only one markdown exporter remains in `src/` after
      `TASK-collapse-duplicate-markdown-exporter.md`
- [ ] The generated narrative prose flows through the existing `marked` +
      `dompurify` pipeline rather than a second parser

## Current State

Greenfield. No publication artifact and no book compiler exists in `src/`, and no
pre-existing ticket or epic proposes a comic concept (see the ground-state table
above for the exact scope of the `.plan/` occurrences, all of which are downstream
of this epic). The dependencies listed above are the only prior art; this epic
creates the artifact model the others have no home for.