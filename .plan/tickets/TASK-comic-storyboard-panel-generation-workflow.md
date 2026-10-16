<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comic Panel Generation Workflow (Storyboard → Art Dispatch)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-comic-page-panel-layout-model.md`, `TASK-publication-art-quality-gates.md`, `TASK-illustrated-book-reference-pass.md`, `TASK-comic-caption-bubble-layout.md`, `epic-assistant-creative-studio-workflows.md`, `epic-comfyui-plugin.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

The illustrated comic tier's generation path: a `comic-storyboard` workflow
template that turns a script into an ordered page/panel list (each panel with an
art prompt, a caption, and a layout slot), then dispatches image generation for
each panel and writes the resulting assets onto the panel rows.

## Context

Two phases, one template. The storyboard phase is LLM text and fits the existing
harness exactly: `configs/templates/workflows/comic-storyboard.yaml` declares
`intent: { type: generate, target: comic }`, steps for script → page/panel list →
per-panel prompt refinement, and a `dispatch` block. Intent routing, however, is
**not** free — it needs work this ticket owns:

- `INTENT_PATTERNS` (`src/regex/intent.ts:19`) declares eight `generate` targets
  today — `character`, `item`, `location`, `world`, `npc`, `species`, `image`,
  `quest`. There is **no `comic` entry**.
- `matchWorkflowIntent` (`src/assistant/workflow-routing.ts:94`) can only return a
  registered target: it resolves the best-matching group, then does
  `routed.find((w) => w.intent?.target === best.target)` (`:114`). With no `comic`
  group the template is unreachable by intent no matter what the YAML declares.

So the ticket adds a `comic` entry to `INTENT_PATTERNS` (e.g. `/draw.*comic/i`,
`/make.*comic/i`, `/comic.*page/i`) and covers the pair in the routing test. Until
that lands only the literal `triggers` list routes here, via `matchWorkflowTrigger`.
No new `AssistantIntent` value — the intent stays `generate`; only the target is new.
Note `image` is already a registered target, so a comic request phrased as an image
request may bind to the image group instead; check that interaction in the test.

The **art dispatch phase does not fit the current runner** and that is the honest
shape of this ticket. `WorkflowDispatchConfig`
(`src/config/sections/templates-workflow.ts:45`) carries a `target` endpoint and
a `payloadTemplate`, and `confirmAndDispatch` returns a payload envelope; it
performs no I/O. A comic run dispatches *N* image jobs (one per panel), each of
which may be slow, may fail independently, and must be resumable after a partial
run. So:

- the storyboard phase uses `src/assistant/workflow-runner.ts` unchanged;
- the art phase is a **dispatch handler** beside it that consumes the confirmed
  storyboard and issues one generation request per panel, writing each result as
  it lands rather than at the end.

The generation endpoints already exist and are the ones to call:
`POST /api/v1/generation/image` (`src/generation/controller.ts:123`) and
`POST /api/v1/image-edit/run` (`src/image-edit/routes.ts:247`), both mounted on
the v1 content surface (`src/routes/v1/content-surface.ts`). Backends are
ComfyUI / sd.cpp under `epic-comfyui-plugin.md`. Do not add a new generation route.

Each generated image is persisted with `createAsset`
(`src/assets/service/create.ts`) and associated with its panel via `linkAsset`
(`src/assets/service/links.ts`) plus the `art_asset_id` column from the schema
ticket — the dispatcher must not invent a publication-specific blob path.

Panel-by-panel failure is a first-class outcome: a failed panel leaves its row
with `art_asset_id` null and a recorded error, and a re-run fills only the empty
rows. Regenerating one accepted panel is the review surface's job, not this
ticket's.

**Reference conditioning is not built here.** Character consistency across
panels needs the reference-conditioned edit templates under
`epic-comfyui-plugin.md` (FLUX.1 Kontext / Qwen Image Edit / Krea 2), which are open
there. This ticket dispatches through the ordinary generation/edit path and
accepts an optional reference-set input; the consistency guarantee itself is
carried by `TASK-publication-art-quality-gates.md` and
`TASK-illustrated-book-reference-pass.md`. If the reference templates have
landed by the time this ships, wire the reference set through; if not, ship
without it and record the gap — do not block the storyboard path on it.

## Acceptance Criteria

- [ ] `configs/templates/workflows/comic-storyboard.yaml` exists with `merge: extend`
      and a `comic-storyboard` workflow declaring `intent`
      (`type: generate, target: comic`), `triggers`, and steps for script →
      page/panel list → per-panel prompt refinement
- [ ] The loader accepts the file with no validation error; every `step`
      validates against `WorkflowStepConfig`
- [ ] A `comic` entry is added to `INTENT_PATTERNS` (`src/regex/intent.ts`) and `matchWorkflowIntent` reaches `comic-storyboard` for an imperative comic generation message, covered by a test in `src/assistant/workflow-routing.test.ts`. Until this AC is met, `matchWorkflowIntent` provably cannot return the template (see Context)
- [ ] A confirmed storyboard parses into ordered `publication_units` (pages) and
      `publication_panels` rows, each panel carrying its art prompt, caption, and
      layout slot; a malformed storyboard payload is rejected at the boundary and
      persists nothing
- [ ] A dispatch handler issues one `POST /api/v1/generation/image` per panel and
      writes each result with `createAsset` + `linkAsset` onto that panel's
      `art_asset_id` as it completes
- [ ] A failed panel leaves its row with `art_asset_id` null and a persisted
      error; re-running fills only the empty rows and does not regenerate
      already-generated panels (route/service test)
- [ ] The handler accepts an optional reference-set input and forwards it to the
      image-edit endpoint when supplied; it does not implement reference
      conditioning itself
- [ ] No new generation route is added — the handler calls the existing
      `src/generation/controller.ts` / `src/image-edit/routes.ts` endpoints
- [ ] Owner authorization enforced on storyboard dispatch and on panel art writes
- [ ] The confirmed-run contract holds: no panel is generated before the
      storyboard run is confirmed