<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant Creative Studio — Workflow Templates

**Status:** 📝 Draft
**Priority:** High (MVP scoped, post-Gate C)
**Effort:** Large
**Epic:** `epic-assistant-creative-studio-workflows`
**Depends on:** `epic-config-templates.md`, `epic-assistant-gm-flows.md`, `epic-assistant-command-execution-intent-detection.md`

## Summary

Implement a config-driven workflow template system for the assistant creative studio.
Workflow templates describe multi-step generation scenarios (e.g. Minimax H3 video generation):
the assistant detects intent, previews prompt steps with recommendations, walks the user
through step-by-step prompt construction with validation, requires final confirmation, then
dispatches the designated generation pipeline / API call.

Built on the existing config template loader (`src/config/templates-loader.ts`,
merge: `replace` | `extend` | `override`) and the `AssistantIntent` taxonomy
(`src/regex/intent.ts`).

## Current State (2026-08-08)

| Component                     | Status                | Location                           |
| ----------------------------- | --------------------- | ---------------------------------- |
| Config template loader        | ✅ Shipped            | `src/config/templates-loader.ts`   |
| Merge strategies              | ✅ Shipped            | `src/config/sections/templates.ts` |
| `AssistantIntent` taxonomy    | ✅ Shipped            | `src/regex/intent.ts:11`           |
| `INTENT_PATTERNS`             | ✅ Shipped            | `src/regex/intent.ts:17-97`        |
| `classifyIntent` (LLM)        | ⚠️ Partial             | `src/generation/auto-gen.ts:74`    |
| Slash command parser          | ✅ Shipped            | `src/assistant/command-parser.ts`  |
| `SDRequest` / `generateImage` | ✅ Removed 2026-08-14 | deleted (dead stub, zero imports; reimplement from scratch) |
| `ScenarioSource`              | ✅ Removed 2026-08-14 | deleted (dead stub, zero imports; reimplement from scratch) |
| `/image` command              | 🟡 Action dispatch    | `src/assistant/commands/image.ts`  |
| `detectIntent()`              | ✅ Removed 2026-08-07 | see `.plan/backlog/open.md` row 4  |

## Design

### Workflow Template Schema

YAML in `configs/templates/workflows/*.yaml`, loaded by the existing template loader.
`steps[]` (id/name/type/recommendations/validation/default/format_template), `dispatch`
(backend/target/endpoint/payload_template/nsfw_policy), and `approval` (type/preview/quality_gates).
Each workflow also declares a `model_family` that maps to a shared preset defining per-family
prompt formatting (tags vs natural vs JSON vs edit-instruction), parameter schemas, token limits,
and recommendation presets (`configs/templates/workflows/model-families.yaml`).

### Runtime Flow

```
User message
  → classifyIntent / INTENT_PATTERNS
    → match workflow triggers
  → WorkflowRunner.start(workflowId)
    → Phase 1: Preview steps + recommendations
    → Phase 2: Step-by-step prompt building (validate + recommend per step)
    → Phase 3: Final confirmation
      → confirm → dispatch (backend + payload_template)
      → cancel → abort
  → else: fall through to chat / standard command path
```

### Sourceable / Configurable

- Default workflows ship in-source as YAML, covering all model families (SD variants,
  Flux, Qwen, Wan, LTX, Krea 2, Anima, Ideogram 4, Z-Image, Minimax H3).
- `configs/templates/workflows/model-families.yaml` defines per-family prompt formatting,
  parameter schemas, validation constraints, and recommendation presets.
- User override via `configs/templates/workflows/*.yaml` with same merge strategies.
- Plugin extension point: `PluginExtensionPoint<"assistant-workflows">`.

## Acceptance Criteria

- [ ] Workflow template schema defined in `src/config/sections/templates.ts`
- [ ] Workflow templates loaded from `configs/templates/workflows/*.yaml` via existing loader
- [ ] `INTENT_PATTERNS` extended with workflow trigger rules
- [ ] `WorkflowRunner` implements start → preview → step → confirm → dispatch
- [ ] Step validation + recommendations engine
- [ ] Dispatch to `POST /api/generation/video` (and other pipelines)
- [ ] Default workflows: video, image, image-edit, character/world/location/entity gen
- [ ] Model family presets: SD (1.5/SDXL/Illustrious/Noob/Pony/Chroma), Flux, Qwen (Edit),
      Wan, LTX, Krea 2, Anima, Ideogram 4 (JSON), Z-Image, Minimax H3 — all with correct prompt formatting
- [ ] NSFW prefiltering + consent gate integrated for third-party API backends
- [ ] Merge strategies (replace/extend/override) work for workflows
- [ ] Plugin extension point registers additional workflows
- [ ] Unit tests for loader, step validation, intent→workflow routing
- [ ] Integration test: Minimax H3 end-to-end

## Implementation Plan

### Phase 1 — Schema & Loader

- [ ] Add `WorkflowTemplateConfig` types to `src/config/sections/templates.ts`
- [ ] Add `ModelFamilyPreset` types to `src/config/sections/templates.ts`
- [ ] Extend `TemplatesConfig` with `workflows?: WorkflowTemplateConfig` + `model_families?`
- [ ] Add workflow + model family preset loading to `src/config/templates-loader.ts`
- [ ] Create `configs/templates/workflows/defaults.yaml` with Minimax H3 example
- [ ] Create `configs/templates/workflows/model-families.yaml` (all model families)

### Phase 2 — Intent Routing

- [ ] Extend `INTENT_PATTERNS` in `src/regex/intent.ts` with workflow triggers
- [ ] Wire `classifyIntent` (fix timeout/apiKey — see `TASK-assistant-command-execution-intent-detection.md`)
- [ ] Tests for intent → workflow matching

### Phase 3 — Workflow Runner

- [ ] Create `src/assistant/workflow-runner.ts`:
  - `startWorkflow(workflowId)`
  - `previewSteps()` — return step titles + descriptions + recommendations + model-family tips
  - `buildStep(stepId, value)` — validate + recommend per step
  - `applyModelFamilyFormat(stepId, rawInput)` — format prompt per family preset (tags/natural/JSON/edit-instruction)
  - `assemblePrompt()` — combine step values per template + family formatter
  - `confirmAndDispatch()` — final confirmation → NSFW check → dispatch
- [ ] Implement model family formatter engine (reads `model-families.yaml` presets)
- [ ] Create `src/assistant/workflow-runner.test.ts`
- [x] ~~Activate `src/assistant/sd.ts` stubs~~ — DELETED 2026-08-14 (dead code cleanup; reimplement from scratch when provider is ready)
- [x] ~~Activate `src/assistant/scenario-source.ts` stubs~~ — DELETED 2026-08-14 (dead code cleanup; reimplement from scratch when DB table exists)

- [ ] Wire dispatch to `POST /api/generation/video` + existing generation pipelines
- [ ] Wire third-party API dispatch to `TASK-assistant-third-party-api-integration.md`
- [ ] Wire NSFW prefiltering to `TASK-assistant-nsfw-api-prefiltering.md`
- [ ] Frontend: `src/frontend/creative-studio/workflow.ts` — step UI + confirmation modal
- [ ] Plugin extension point registration

### Phase 5 — Default Workflows

- [ ] Video generation (Minimax H3, Wan, LTX)
- [ ] Image generation (SD 1.5, SDXL, Flux, Qwen, Krea 2, Anima, Z-Image)
- [ ] Image editing (FLUX.1 Kontext, Qwen Edit)
- [ ] Ideogram 4 (JSON prompt format)
- [ ] Pony (rating-tag workflow)
- [ ] Illustrious / Noob / Chroma (SDXL variants)
- [ ] Character generation
- [ ] World generation
- [ ] Location generation
- [ ] Item generation
- [ ] NPC generation
- [ ] Entity-type presets (`configs/templates/workflows/entity-types.yaml` — §7.6c)

## Files

| File                                              | Action                           |
| ------------------------------------------------- | -------------------------------- |
| `src/config/sections/templates.ts`                | modify                           |
| `src/config/templates-loader.ts`                  | modify                           |
| `configs/templates/workflows/entity-types.yaml`   | new (entity type presets, §7.6c) |
| `configs/templates/workflows/defaults.yaml`       | new                              |
| `configs/templates/workflows/model-families.yaml` | new                              |
| `src/regex/intent.ts`                             | modify                           |
| `src/assistant/workflow-runner.ts`                | new                              |
| `src/assistant/workflow-runner.test.ts`           | new                              |
| `src/assistant/sd.ts`                             | reimplement (deleted 2026-08-14)  |
| `src/assistant/scenario-source.ts`                | reimplement (deleted 2026-08-14)  |
| `src/routes/generation/video.ts`                  | new                              |
| `src/routes/generation/third-party.ts`            | new (third-party API dispatch)   |
| `src/frontend/creative-studio/workflow.ts`        | new                              |

## Related

- **Feature spec:** `docs/spec/creative-studio.md` (stub)
- **Epic:** `epic-assistant-creative-studio-workflows.md`
- **Related epics:** `epic-config-templates.md`, `epic-assistant-gm-flows.md`,
  `epic-creative-studio.md`, `epic-assistant-generation-extensions.md`,
  `epic-llm-queue.md`, `epic-comfyui-plugin.md`, `epic-audio-video-sound.md`,
  `epic-plugin-system.md`

- **Dependent tasks:** `TASK-assistant-third-party-api-integration.md` (third-party API
  dispatch adapters), `TASK-assistant-nsfw-api-prefiltering.md` (NSFW prefiltering + consent)
