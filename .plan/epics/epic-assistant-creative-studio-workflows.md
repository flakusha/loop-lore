<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Assistant Creative Studio — Workflow Templates

**Status:** 📝 Draft (coordination hub — split into 4 sub-epics)
**Priority:** High (MVP scoped, post-Gate C)
**Effort:** Large
**Type:** Feature Epic / Configuration
**Tags:** assistant, creative-studio, workflows, templates, intent-detection, yaml, scenario-source
**Proposed Epic Branch:** epic/creative-studio-workflows
**Depends on:** Configurable Template System (`epic-config-templates.md`), Assistant/GM Flows (`epic-assistant-gm-flows.md`), Creative Studio (`epic-creative-studio.md`)
**Spec:** `docs/spec/assistant-commands.md` (may drift — `src/` is authoritative)

---

## Summary

A **workflow template system** for the assistant creative studio. Users invoke a named
workflow (e.g. "Minimax H3 video generation"); the assistant detects intent, previews the
prompting steps based on the template, walks the user through prompt construction with
recommendations on logic, order, contents, and syntax, requires final confirmation, then
dispatches the designated generation pipeline / API call / scenario based on the template.
Applicable to all assistant-related generation workflows, not just video.

The system reuses the existing **config-driven template loader** (`src/config/templates-loader.ts`,
merge: `replace` | `extend` | `override`) and the **`AssistantIntent` taxonomy** in
`src/regex/intent.ts` (`"generate" | "tool_exec" | "api_call" | "chat"`).

> **⚠️ This epic is a coordination hub.** Implementation work is split into 4 sub-epics below. This file keeps the problem statement, current state, shared template-system interfaces, canonical config examples, and sequencing.

## Sub-Epics

| Sub-Epic                        | Epic File                             | Scope                                                                                                                                  | Priority                       |
| ------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Workflow Engine**             | `epic-workflow-engine.md`             | Template schema, multi-file directory discovery in the loader, runtime flow, intent-to-workflow routing, approval/quality-gate plumbing | High (MVP scoped, post-Gate C) |
| **Model Family Presets**        | `epic-model-family-presets.md`        | `model-families.yaml` authoring for 17 families, formatter application at dispatch (config-heavy, low code)                            | High (MVP scoped, post-Gate C) |
| **Entity Generation Workflows** | `epic-entity-generation-workflows.md` | Entity-type presets, per-entity step schemas, entity quality gates, `/create` gating integration, NPC intent target decision           | High (MVP scoped, post-Gate C) |
| **Gallery Batch Operations**    | `epic-gallery-batch-operations.md`    | Selection model, batch-action bar, v1 batch download/delete behind NSFW/ownership gates                                                | High (MVP scoped, post-Gate C) |

## Sequencing

1. **Workflow Engine** first — prerequisite for all other sub-epics (schema, loader,
   runner, gates).
2. **Model Family Presets** and **Entity Generation Workflows** build directly on the
   engine (Phase 2b formatter hook; entity templates as workflow instances).
3. **Gallery Batch Operations** is standalone UI scope — no dependency on siblings;
   ships before or after them.


---

## Problem

Today the assistant command system has:

- 21 slash commands wired (`src/assistant/commands/`, `src/assistant/command-parser.ts`
  — 2026-08-01 review), but most (`/image`, `/video`, `/music`, `/sfx`, `/caption`, `/quest`)
  return system-message stubs or frontend action dispatches with **no prompt preview, no
  step-by-step guidance, no confirmation gating**.
- `/image` delegates to a frontend action (`action: "generate-image"`, 832 bytes,
  `src/assistant/commands/image.ts`) — the backend `SDRequest` interface and
  `generateImage()` in `src/assistant/sd.ts` are dead stubs with no provider wiring.
- `src/assistant/scenario-source.ts` has the `ScenarioSource` interface and
  `storeScenarioSources` / `findScenarioSources` / `bridgeToBlog` stubs — no DB table, no
  reuse in generation.
- No mechanism for **configurable, sourceable workflow templates** that describe a multi-step
  generation scenario (prompt phases, parameter slots, backend routing, approval policy).

The user has no way to say "generate a video the way I want" and get back a structured,
confirmable, template-driven prompt + dispatch plan.

---

## Current State (2026-08-08)

### What exists (foundation to build on)

| Component                                  | Status                | Location                                                              |
| ------------------------------------------ | --------------------- | --------------------------------------------------------------------- |
| Config template loader                     | ✅ Shipped            | `src/config/templates-loader.ts`, `sections/templates.ts`             |
| Merge strategies (replace/extend/override) | ✅ Shipped            | `src/config/sections/templates.ts`                                    |
| `AssistantIntent` taxonomy                 | ✅ Shipped            | `src/regex/intent.ts:11`                                              |
| `INTENT_PATTERNS` keyword array            | ✅ Shipped            | `src/regex/intent.ts:17-97`                                           |
| `classifyIntent` (LLM)                     | ⚠️ Partial            | `src/generation/auto-gen.ts:74` (no timeout, no apiKey, temp 0.1)     |
| Slash command parser + registry            | ✅ Shipped            | `src/assistant/command-parser.ts`, `commands/registry.ts`             |
| Prompt assembler (section pipeline)        | ✅ Shipped            | `src/assistant/prompt-assembler.ts`                                   |
| `SDRequest` / `generateImage`              | ✅ Removed 2026-08-14 | `src/assistant/sd.ts` deleted (dead stub, zero imports)               |
| `ScenarioSource` store + bridge            | ✅ Removed 2026-08-14 | `src/assistant/scenario-source.ts` deleted (dead stub, zero imports)  |
| `/image` command                           | 🟡 Action dispatch only | `src/assistant/commands/image.ts` (832 bytes)                       |
| Dead `detectIntent()`                      | ✅ Removed 2026-08-07 | `src/assistant/intent.ts` (see `.plan/backlog/open.md` row 4)         |

### What needs building

| Layer                | Item                                                                     | Sub-Epic                          |
| -------------------- | ------------------------------------------------------------------------ | --------------------------------- |
| Schema               | Workflow template types in `sections/templates.ts`                       | Workflow Engine                   |
| Loader               | Workflow template loading in `templates-loader.ts`                       | Workflow Engine                   |
| Model family presets | `configs/templates/workflows/model-families.yaml` + formatter engine     | Model Family Presets              |
| Intent routing       | Extend `INTENT_PATTERNS` with workflow triggers                          | Workflow Engine                   |
| Runner               | `src/assistant/workflow-runner.ts` (start/preview/step/confirm/dispatch) | Workflow Engine                   |
| Defaults             | `configs/templates/workflows/defaults.yaml` (in-source)                  | Workflow Engine                   |
| Dispatch             | Wire to `/api/generation/video` + existing generation providers          | Workflow Engine                   |
| Frontend             | Creative studio step UI + confirmation modal                             | Workflow Engine                   |
| Third-party APIs     | Integration framework for Minimax H3, Nano Banana, etc. (see TASK)       | Workflow Engine (dispatch wiring) |
| NSFW prefiltering    | Per-backend NSFW policy + consent (see TASK)                             | Workflow Engine                   |
| Entity workflows     | character/world/location/item/npc generation templates                   | Entity Generation Workflows       |
| Gallery batch        | Selection state + batch download/delete                                  | Gallery Batch Operations          |
| Gallery edit         | Wrap `src/image-edit/` as workflow UX                                    | Not yet split                     |
| Tests                | Workflow loader, step validation, intent matching                        | Workflow Engine (+ subs)          |

---

## Scope

- Workflow template schema definition (YAML-driven)
- Model family presets (per-family prompt formatting, validation, params, recommendations)
- Config-driven loading + merge strategy
- Intent detection → workflow routing
- Step-by-step prompt builder with recommendations + validation
- Confirmation gating (quality + user approval)
- Dispatch to designated generation pipeline / API call
- In-source default workflows (video, image, image-edit, character/world/location gen)
- Plugin extensibility for additional workflows
- Applicable to ALL assistant generation workflows (not just Minimax H3)

### Non-goals (v1)

- Implementing the actual Minimax H3 API provider (that's `epic-audio-video-sound.md`)
- Implementing ComfyUI/sd.cpp backends (that's `epic-assistant-generation-extensions.md`)
- Changing the core `classifyIntent` LLM routing (fixing its timeout/apiKey is tracked
  in `TASK-assistant-command-execution-intent-detection.md`)
- Implementing actual third-party generation API providers (Minimax H3, Nano Banana,
  etc. — that's `epic-audio-video-sound.md` + `TASK-assistant-third-party-api-integration`)
- Adding NSFW labeling/prefiltering for third-party API dispatch (that's
  `TASK-assistant-nsfw-api-prefiltering`)

### NSFW Handling for Workflows (owned by Workflow Engine sub-epic)

Third-party image/video generation APIs enforce NSFW restrictions differently. The
workflow `dispatch` block carries an `nsfw_policy` handled at dispatch time:

| Concern                | Approach                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Content classification | Workflow `dispatch` includes an `nsfw_policy` field with per-backend rules                                             |
| Prefiltering           | Run the assembled prompt through the NSFW moderation service before dispatch (`src/nsfw/`)                             |
| Internal labeling      | If NSFW content is detected and the backend allows it, attach the NSFW content rating tag to the payload               |
| Rejection routing      | If the backend rejects NSFW, route to an alternative NSFW-capable backend or notify the user                           |
| User consent           | For NSFW-capable backends, require explicit consent (reuses `epic-nsfw-capabilities.md` consent infrastructure) |

See `TASK-assistant-nsfw-api-prefiltering.md` for implementation.

> **Bridge:** NSFW ratings/consent/age-gate: see `epic-nsfw-capabilities.md`; moderation enforcement: see `epic-nsfw-moderation-priority.md`.

---

## Shared Template System Interfaces

### Template System Reuse (§7.5)

All workflow config domains share the same `MergeStrategy` type
(`"replace" | "extend" | "override"`) from `src/config/sections/templates.ts` and the
`findConfigFile()` / `parseFileContent()` / `deepMerge()` pipeline in the config loader.

| Template domain            | Config file                                             | Epic ref                           |
| -------------------------- | ------------------------------------------------------- | ---------------------------------- |
| LLM system prompts         | `configs/templates/llm.yaml`                            | `epic-config-templates.md` Phase 4 |
| SD image profiles          | `configs/templates/sd.yaml`                             | `epic-config-templates.md` Phase 2 |
| Avatar emotion patterns    | `configs/templates/avatar.yaml`                         | `epic-config-templates.md` Phase 3 |
| Image-edit workflows       | `configs/templates/image-edit.yaml`                     | `epic-config-templates.md` Phase 4 |
| **Assistant workflows**    | `configs/templates/workflows/*.yaml`                    | **Workflow Engine sub-epic**       |
| **± Model family presets** | `configs/templates/workflows/model-families.yaml`       | **Model Family Presets sub-epic**  |
| **± Entity type presets**  | `configs/templates/workflows/entity-types.yaml`         | **Entity Generation Workflows sub-epic** |
| **± Third-party adapters** | `configs/templates/workflows/third-party-adapters.yaml` | **Workflow Engine sub-epic** (Phase 4)   |

### Canonical Example: Workflow Template Schema (§7.1)

Reference schema consumed by every sub-epic; the Workflow Engine owns its runtime
interpretation:

```yaml
# configs/templates/workflows/minimax-h3-video.yaml
merge: extend
workflows:
  minimax-h3-video:
    id: minimax-h3-video
    name: "Minimax H3 Video"
    description: "Generate a short video via Minimax H3 API"
    category: "video"
    model_family: minimax-h3 # maps to a model family preset (Model Family Presets sub-epic)
    version: "1.0.0"
    intent:
      # Maps to AssistantIntent in src/regex/intent.ts
      type: generate
      target: image-generation # reuse existing generation target
      confidence_threshold: 0.6
      requires_approval: true
      triggers:
        - "minimax"
        - "(?:generate|create|make).+video"
        - "h3 video"
    steps:
      - id: scene
        name: "Scene Description"
        type: prompt
        format_template: "{{raw}}"
        required: true
        recommendations:
          - "Be specific about setting, lighting, and composition"
          - "Limit to 1-2 main subjects"
        validation:
          min_length: 10
          max_length: 500
      - id: motion
        name: "Motion & Style"
        description: "Describe motion, camera movement, and visual style"
        type: prompt
        required: false
        format_template: "{{raw}}" # family-specific formatting applied at dispatch
        recommendations:
          - "Use cinematic terms (slow zoom, tracking shot)"
        default: "cinematic, smooth motion, 4K"
      - id: parameters
        name: "Parameters"
        description: "Video parameters: duration, resolution, frame rate"
        type: parameters
        schema:
          duration:
            type: number
            min: 1
            max: 10
            default: 5
          resolution:
            type: string
            options: ["720p", "1080p", "4K"]
            default: "1080p"
          frame_rate:
            type: number
            min: 1
            max: 60
            default: 30
    dispatch:
      backend: api_call
      target: minimax-h3
      endpoint: /api/generation/video
      payload_template: |
        {
          "prompt": "{{steps.scene.value}} {{steps.motion.value}}",
          "duration": {{steps.parameters.value.duration}},
          "resolution": "{{steps.parameters.value.resolution}}",
          "frame_rate": {{steps.parameters.value.frame_rate}}
        }
    approval:
      # Quality + user confirmation gating (reuses epic-assistant-gm-flows quality gates)
      type: confirm
      preview: true
      quality_gates:
        - type: schema
        - type: consistency
        - type: duplicate
```

Full per-domain preset examples live in their owning sub-epics:
`model-families.yaml` → Model Family Presets; `entity-types.yaml` +
`character-generation.yaml` → Entity Generation Workflows.

---

## Use Case: Minimax H3 Video Generation (End-to-End Walkthrough)

Spans Workflow Engine (intent routing, runner, approval) + Model Family Presets
(`minimax-h3` family):

1. **User** types: *"Generate a 5-second video of a cyberpunk samurai drawing his sword in the rain."*
2. **Intent detection** (`classifyIntent` in `src/generation/auto-gen.ts:74`) matches
   `minimax` + `video` triggers → routes to the `minimax-h3-video` workflow template.
3. **Workflow runner** (`src/assistant/workflow-runner.ts`) loads the template, previews
   3 steps (Scene Description, Motion & Style, Parameters) with recommendations.
4. **Step-by-step prompting**: scene validated (10–500 chars); motion recommended with
   cinematic terms; parameters auto-filled from template defaults, user confirms.
5. **Final confirmation**: assembled prompt + payload summary; confirm → dispatch,
   cancel → abort.
6. **Dispatch** → `POST /api/generation/video` → `src/generation/llm-queue.ts` (via
   `epic-llm-queue.md`) → Minimax H3 provider → result attached to chat as video asset.

## Use Case: Nano Banana Image Generation w/ NSFW Prefiltering

1. **User** types: *"Create a spicy portrait of my character in lingerie."*
2. **Intent detection**: matches Nano Banana + image triggers → `nano-banana-image`
   workflow (model_family: `z-image`).
3. **NSFW prefilter** (before step building): `dispatch.nsfw_policy` requires
   classification + consent; assistant asks for consent before proceeding.
4. **Step-by-step prompting** against Z-Image tag formatting from the `z-image` preset.
5. **Final confirmation**: formatted prompt shown; NSFW label attached to payload.
6. **Dispatch** → `POST /api/generation/third-party` → result attached to chat as image
   asset, labeled with NSFW rating tag.

---

## Files

| File                                                                     | Status                                     | Sub-Epic                      |
| ------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------- |
| `src/config/sections/templates.ts`                                       | modify                                     | Workflow Engine               |
| `src/config/templates-loader.ts`                                         | modify                                     | Workflow Engine               |
| `configs/templates/workflows/defaults.yaml`                              | new                                        | Workflow Engine               |
| `configs/templates/workflows/model-families.yaml`                        | new                                        | Model Family Presets          |
| `configs/templates/workflows/entity-types.yaml`                          | new (entity type presets, §7.6c)           | Entity Generation Workflows   |
| `src/regex/intent.ts`                                                    | modify                                     | Workflow Engine (+ Entity)    |
| `src/assistant/workflow-runner.ts`                                       | new                                        | Workflow Engine               |
| `src/assistant/workflow-runner.test.ts`                                  | new                                        | Workflow Engine               |
| `src/frontend/creative-studio/workflow.ts`                               | new                                        | Workflow Engine               |
| `src/routes/generation/video.ts`                                         | new (dispatch target)                      | Workflow Engine               |
| `configs/templates/workflows/third-party-adapters.yaml`                  | new (third-party API adapters)             | Workflow Engine               |
| `src/routes/generation/third-party.ts`                                   | new (third-party API dispatch)             | Workflow Engine               |
| `.plan/tickets/TASK-assistant-creative-studio-workflows.md`              | new                                        | hub                           |
| `.plan/tickets/TASK-assistant-third-party-api-integration.md`            | new                                        | hub                           |
| `.plan/tickets/TASK-assistant-nsfw-api-prefiltering.md`                  | new                                        | hub                           |
| `src/frontend/alpine/chat-utils/gallery.ts` (selection store)            | modify                                     | Gallery Batch Operations      |
| `src/routes/assets.ts` — `POST /api/assets/batch-download` handler (zip) | new (mount in `src/elysia-app.ts`)         | Gallery Batch Operations      |
| `src/components/chat/gallery-sidebar.html` (batch-action bar)            | modify                                     | Gallery Batch Operations      |
| `src/assistant/workflows/gallery-edit.ts`                                | new (edit workflow UX over src/image-edit) | Not yet split                 |
| `configs/templates/workflows/gallery-edit.yaml`                          | new                                        | Not yet split                 |

---

## Related Epics

### Direct Dependencies

- **`epic-config-templates.md`** — 🟡 In Progress. The template loader, merge strategies,
  and `MergeStrategy` type are the backbone. This epic adds a new domain
  (`workflows`) to the same system.
- **`epic-assistant-gm-flows.md`** — 🟡 In Progress. Quality gating and confirmation
  gating already apply to GM/assistant generation; workflows extend this pattern to
  multi-step creative scenarios.
- **`epic-creative-studio.md`** — 📝 Draft → 🟡 In Progress (MVP scoped). The Creative
  Studio provides the UI surface (modals, context menus, toolbar) that workflows
  integrate into.
- **`epic-assistant-generation-extensions.md`** — ⬜ Not Started. Image/video/audio
  backend providers are the dispatch targets. This epic provides the template-driven
  routing layer; that epic provides the actual media generation backends.

### Connected

- **`epic-llm-queue.md`** — LLM request throughput scheduling; workflow dispatch
  routes through the queue for API call backends.
- **`epic-comfyui-plugin.md`** — ComfyUI workflow templates are a dispatch target;
  image-edit workflows reuse ComfyUI finalized workflow JSON as the payload.
- **`epic-audio-video-sound.md`** — Minimax H3 video, audio/SFX/music generation
  backends; the dispatch targets for video/audio workflows.
- **`epic-plugin-system.md`** — plugin extension point for registering additional
  assistant workflows.
- **`epic-character-spec.md`** — character generation workflows target the character
  data model.
- **`epic-items.md`** / **`epic-worlds-extension.md`** / **`epic-locations.md`** /
  **`epic-npcs.md`** — entity generation workflows target these systems.
- **`epic-frontend-gallery.md`** — gallery surface extended by Gallery Batch Operations.

### Related Tasks

- `.plan/tickets/TASK-assistant-creative-studio-workflows.md` — this epic's
  implementation (schema, loader, runner, model family presets, dispatch, frontend).
- `.plan/tickets/TASK-assistant-third-party-api-integration.md` — Nano Banana,
  Minimax H3, and other third-party API dispatch adapters (separate from backend providers).
- `.plan/tickets/TASK-assistant-nsfw-api-prefiltering.md` — NSFW prefiltering,
  per-backend policy, internal labeling, consent gate, rejection routing.
- `.plan/tickets/TASK-assistant-command-execution-intent-detection.md` — fixes
  `classifyIntent` timeout/apiKey (blocking dependency for workflow intent routing).
- `.plan/tickets/TASK-assistant-creative-studio-workflow-gallery-batch.md` — gallery batch selection + batch download
- `.plan/tickets/TASK-assistant-creative-studio-workflow-gallery-edit.md` — gallery edit workflows (wraps src/image-edit)

---

## References

- `src/config/sections/templates.ts` — `MergeStrategy`, `TemplatesConfig`, domain configs
- `src/config/templates-loader.ts` — loader pipeline (find, parse, merge)
- `src/config/templates-loader/discovery.ts` — `TEMPLATE_FILES` single-file map (multi-file directory discovery is new)
- `src/regex/intent.ts` — `AssistantIntent`, `INTENT_PATTERNS`, `SLASH_COMMAND`
- `src/assistant/intent.ts` — `detectAvatarChangeIntent` (config-driven pattern matching)
- `src/assistant/command-parser.ts` — slash command parsing (`BUILTIN_COMMANDS`)
- `src/assistant/commands/registry.ts` — `CommandContext`, `CommandResult`, `registerCommand`
- `src/assistant/prompt-assembler.ts` — ordered section pipeline (pattern to follow)
- `src/assistant/sd.ts` — ~~dead stubs~~ REMOVED 2026-08-14 (to reimplement from scratch)
- `src/assistant/scenario-source.ts` — ~~dead stubs~~ REMOVED 2026-08-14 (to reimplement from scratch)
- `src/assistant/commands/image.ts` — current `/image` action dispatch (832 bytes)
- `src/generation/auto-gen.ts:74` — `classifyIntent` LLM routing (needs timeout/apiKey fix)
- `docs/spec/creative-studio.md` — creative studio spec (stub)
- `docs/spec/assistant-commands.md` — command spec (may drift)
- `configs/templates/llm.example.yaml`, `sd.example.yaml`, `avatar.example.yaml`,
  `image-edit.example.yaml`, `character.example.yaml`, `expansion.example.yaml` —
  existing template example files (pattern to follow)
- `.plan/backlog/open.md` § Dead / unwired code — `detectIntent` removal (row 4),
  `scenario-source.ts` + `sd.ts` dead stubs (row 10 — DELETED 2026-08-14)
- `.plan/epics/epic-config-templates.md` — template system design doc
