# Epic: Assistant Creative Studio — Workflow Templates

**Status:** 📝 Draft
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

## Design

### 7.1 Workflow Template Schema

Stored as YAML in `configs/templates/workflows/*.yaml`, loaded by the existing template
loader pipeline (`src/config/templates-loader.ts` + `src/config/sections/templates.ts`).
Each workflow is a named, versioned template with metadata, step definitions, parameter
slots, backend dispatch, and approval policy.

```yaml
# configs/templates/workflows/minimax-h3-video.yaml
merge: extend
workflows:
  minimax-h3-video:
    id: minimax-h3-video
    name: "Minimax H3 Video"
    description: "Generate a short video via Minimax H3 API"
    category: "video"
    model_family: minimax-h3 # maps to a model family preset (see § 7.1b)
    version: "1.0.0"
    intent:
      # Maps to AssistantIntent in src/regex/intent.ts
      type: generate
      target: image-generation # reuse existing generation target
      confidence_threshold: 0.6
      requires_approval: true
      # Keyword/regex triggers for intent matching
      triggers:
        - "minimax"
        - "(?:generate|create|make).+video"
        - "h3 video"
    steps:
      - id: scene
        name: "Scene Description"
        type: prompt
        # Apply model-family-specific formatting to raw user input
        # (e.g. for SDXL: natural-language desc + weighted tags, Flux: no weights)
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
      # Which generation pipeline / API to call
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

### 7.1b Model Family Presets

Each workflow declares a `model_family`. A companion `model_family_presets` config block
(`configs/templates/workflows/model-families.yaml`) defines per-family formatting rules,
validation constraints, parameter schemas, and recommendation presets. When a step has
a `format_template`, the runner applies the family preset's formatter to the raw user input
before dispatching.

```yaml
# configs/templates/workflows/model-families.yaml
merge: extend
model_family_presets:
  sd-1-5:
    name: "Stable Diffusion 1.5"
    category: image
    prompt_format: tags # comma-separated, weighted (word:1.3), no natural prose
    token_limit: 75
    weight_syntax: true
    negative_prompt: true
    parameters:
      steps: { type: number, min: 10, max: 150, default: 30 }
      cfg_scale: { type: number, min: 1, max: 30, default: 7 }
      sampler: { type: string, options: [euler, dpm, ddim], default: euler }
      width: { type: number, min: 64, max: 2048, default: 512 }
      height: { type: number, min: 64, max: 2048, default: 512 }
    recommendations:
      - "Use comma-separated tags, not full sentences"
      - "Place weighted terms at the end: (masterpiece:1.3)"
      - "Use negative prompts: ugly, blurry, lowres, bad-hands-6"
  sd-1-5-pony:
    name: "Pony (SDXL-based)"
    extends: sd-1-5
    extra_steps:
      - id: rating
        name: "Content Rating"
        type: select
        options: [safe, subtle, sensitive, explicit]
        default: safe
    prompt_format: mixed
    recommendations:
      - "Start with (rating:safe) or (rating:explicit)"
      - "Pony needs explicit character/artist tags"
  sdxl:
    name: "SDXL"
    category: image
    prompt_format: mixed
    token_limit: 150
    weight_syntax: true
    negative_prompt: true
    parameters:
      steps: { type: number, min: 10, max: 150, default: 40 }
      cfg_scale: { type: number, min: 1, max: 30, default: 7 }
      width: { type: number, min: 64, max: 2048, default: 1024 }
      height: { type: number, min: 64, max: 2048, default: 1024 }
    recommendations:
      - "Describe the scene in natural language first"
      - "Add weighted tags at the end: (masterpiece:1.2), (best quality:1.2)"
      - "SDXL has 150-token clip limit"
  sd-xl-illustrious:
    name: "Illustrious"
    extends: sdxl
    recommendations:
      - "Include specific artist/character trigger words"
  sd-xl-noob:
    name: "Noob"
    extends: sdxl
    prompt_format: tags
  sd-xl-chroma:
    name: "Chroma (Zeta/Kroma/Radiance)"
    extends: sdxl
  flux:
    name: "FLUX.1"
    category: image
    prompt_format: natural
    token_limit: 250
    weight_syntax: false
    negative_prompt: false
    parameters:
      steps: { type: number, min: 20, max: 100, default: 50 }
      width: { type: number, min: 64, max: 2048, default: 1024 }
      height: { type: number, min: 64, max: 2048, default: 1024 }
      guidance: { type: number, min: 1, max: 10, default: 3.5 }
    recommendations:
      - "Describe in full natural language sentences"
      - "Do NOT use (word:1.3) weighting — FLUX ignores it"
      - "Avoid 'masterpiece', 'best quality' — these trigger unwanted patterns"
      - "Use descriptive composition terms"
  flux-kontext:
    name: "FLUX.1 Kontext"
    extends: flux
    prompt_format: edit-instruction
  qwen-image:
    name: "Qwen Image"
    category: image
    prompt_format: natural
    weight_syntax: false
    parameters:
      steps: { type: number, min: 20, max: 100, default: 50 }
      width: { type: number, min: 64, max: 2048, default: 1024 }
      height: { type: number, min: 64, max: 2048, default: 1024 }
  qwen-edit:
    name: "Qwen Image Edit"
    extends: qwen-image
    prompt_format: edit-instruction
    modes: [t2i, i2i] # dual-mode: text-to-image generation AND image-to-image edit
    recommendations:
      - "Specify what to KEEP and what to CHANGE (i2i edit mode)"
      - "Use precise spatial/attribute descriptions"
      - "t2i mode inherits qwen-image natural-language formatting — no source image required"
  wan:
    name: "Wan"
    category: video
    prompt_format: natural
    parameters:
      duration: { type: number, min: 1, max: 10, default: 5 }
      resolution: { type: string, options: [480p, 720p, 1080p], default: 720p }
      frame_rate: { type: number, min: 16, max: 30, default: 24 }
      steps: { type: number, min: 10, max: 100, default: 50 }
  ltx:
    name: "LTX"
    category: video
    prompt_format: natural
    parameters:
      duration: { type: number, min: 1, max: 10, default: 3 }
      resolution: { type: string, options: [480p, 720p, 1080p], default: 720p }
      frame_rate: { type: number, min: 16, max: 60, default: 30 }
  krea-2:
    name: "Krea 2"
    category: image
    prompt_format: natural
    parameters:
      style_reference: { type: string, description: "URL or path to reference image" }
  anima:
    name: "Anima"
    category: image
    prompt_format: natural
    parameters:
      steps: { type: number, min: 20, max: 100, default: 50 }
  ideogram-4:
    name: "Ideogram 4"
    category: image
    prompt_format: json
    weight_syntax: false
    parameters:
      style: { type: string, options: [subtle, vivid, cinematic] }
      color_palette: { type: string, options: [natural, vibrant, monochrome] }
      aspect_ratio: { type: string, options: [1:1, 16:9, 3:2, 4:5] }
    json_schema:
      text_prompt: { type: string, required: true }
      style: { type: string, options: [subtle, vivid, cinematic] }
      color_palette: { type: string, options: [natural, vibrant, monochrome] }
    recommendations:
      - "Use the JSON structure — do not concatenate as free text"
      - "text_prompt should be natural language description"
      - "Specify style and color_palette separately"
  z-image:
    name: "Z-Image"
    category: image
    prompt_format: tags
    weight_syntax: true
    recommendations:
      - "Comma-separated tags, similar to SD 1.5"
      - "Use negative_prompt for poor anatomy"
  minimax-h3:
    name: "Minimax H3"
    category: video
    prompt_format: natural
    parameters:
      duration: { type: number, min: 1, max: 10, default: 5 }
      resolution: { type: string, options: [720p, 1080p, 4K], default: 1080p }
      frame_rate: { type: number, min: 1, max: 60, default: 30 }
```

#### Model Family Reference

| Family key          | Category | Prompt format        | Weight syntax | Notes                                                     |
| ------------------- | -------- | -------------------- | ------------- | --------------------------------------------------------- |
| `sd-1-5`            | image    | tags (comma-sep)     | yes           | Classic SD tag prompting                                  |
| `sd-1-5-pony`       | image    | mixed (tags+rating)  | yes           | SDXL-based, needs rating tags                             |
| `sdxl`              | image    | mixed (natural+tags) | yes           | Natural desc + weighted tags at end                       |
| `sd-xl-illustrious` | image    | mixed                | yes           | SDXL variant, artist trigger words                        |
| `sd-xl-noob`        | image    | tags                 | yes           | SDXL variant, prefers tag-based                           |
| `sd-xl-chroma`      | image    | mixed                | yes           | SDXL variant (Zeta/Kroma/Radiance)                        |
| `flux`              | image    | natural              | no            | No weighting, avoid "masterpiece"                         |
| `flux-kontext`      | image    | edit-instruction     | no            | "change X to Y", "make X wear Z"                          |
| `qwen-image`        | image    | natural              | no            | Qwen image generation                                     |
| `qwen-edit`         | image    | edit-instruction     | no            | dual mode: t2i generation + i2i edit ("keep X, change Y") |
| `wan`               | video    | natural              | no            | Wan video generation                                      |
| `ltx`               | video    | natural              | no            | LTX video generation                                      |
| `krea-2`            | image    | natural              | no            | Style reference support                                   |
| `anima`             | image    | natural              | no            | Anima image generation                                    |
| `ideogram-4`        | image    | json                 | no            | Structured JSON prompt (not free text)                    |
| `z-image`           | image    | tags                 | yes           | Z-Image, SD-like tag convention                           |
| `minimax-h3`        | video    | natural              | no            | Minimax H3 video generation                               |

### 7.2 Runtime Flow

```
User message
  → classifyIntent (src/regex/intent.ts or LLM classifyIntent in auto-gen.ts)
    → match against workflow.trigger rules
  → if workflow intent matched:
    → AssistantCreativeStudio.startWorkflow(workflowId)
      → Phase 1: Preview steps (titles, descriptions, recommendations)
      → Phase 2: Step-by-step prompt building (user fills each step)
      →   Assistant validates + recommends per step
      → Phase 2b: Format transformation — apply model_family preset formatter
      →   (tags for SD, natural for Flux, edit-instruction for Qwen-Edit,
      →    JSON structure for Ideogram 4)
      → Phase 3: Final confirmation prompt
      →   User confirms → Dispatch (backend + payload_template)
      →   User cancels → Abort
  → else: fall through to chat / standard command path
```

### 7.3 Sourceable / Configurable

- **Default workflows** ship in-source as YAML (bundled at build time), covering all
  model families with model_family-aware prompt formatting:
  SD 1.5, Pony, SDXL, Illustrious, Noob, Chroma; Flux (+ Kontext edit); Qwen Image
  (+ Edit); Wan, LTX, Minimax H3 (video); Krea 2, Anima, Ideogram 4 (JSON),
  Z-Image; plus ComfyUI image generation, character/world/location/entity generation.
- **User override** via `configs/templates/workflows/*.yaml` using the same merge
  strategies (`replace` | `extend` | `override`) from `epic-config-templates.md`.
  Users can add new workflows, override existing ones, or replace the entire set.
- **Plugin extensibility:** plugins register additional workflows via the plugin
  extension point (`epic-plugin-system.md`) — the workflow registry is a
  `PluginExtensionPoint<"assistant-workflows">`.

### 7.4 Intent Detection Integration

The existing `AssistantIntent` taxonomy (`src/regex/intent.ts`) defines
`"generate" | "tool_exec" | "api_call" | "chat"`. Workflow templates extend this:

- `workflow.intent.type` maps to one of the four `AssistantIntent` values.
- The existing `INTENT_PATTERNS` constant (keyword regex array) is **extended** with
  workflow trigger patterns — but only for `generate` workflows. `tool_exec` and
  `api_call` workflows require the approval policy in the template to specify the
  allowlist/policy gate (per `epic-assistant-generation-extensions.md` Phase 4).
- The dead `detectIntent()` / `APPROVED_TOOLS` code was removed 2026-08-07
  (`.plan/backlog/open.md` § Dead / unwired code, row 4). This epic re-introduces
  intent-to-workflow routing **only** through the config-driven template system —
  no standalone regex classifier module.

### 7.5 Reuse of Template System

| Template domain            | Config file                                             | Epic ref                           |
| -------------------------- | ------------------------------------------------------- | ---------------------------------- |
| LLM system prompts         | `configs/templates/llm.yaml`                            | `epic-config-templates.md` Phase 4 |
| SD image profiles          | `configs/templates/sd.yaml`                             | `epic-config-templates.md` Phase 2 |
| Avatar emotion patterns    | `configs/templates/avatar.yaml`                         | `epic-config-templates.md` Phase 3 |
| Image-edit workflows       | `configs/templates/image-edit.yaml`                     | `epic-config-templates.md` Phase 4 |
| **Assistant workflows**    | `configs/templates/workflows/*.yaml`                    | **this epic**                      |
| **± Model family presets** | `configs/templates/workflows/model-families.yaml`       | **this epic** (§7.1b)              |
| **± Entity type presets**  | `configs/templates/workflows/entity-types.yaml`         | **this epic** (§7.6c)              |
| **± Third-party adapters** | `configs/templates/workflows/third-party-adapters.yaml` | **this epic** (Phase 4)            |

All share the same `MergeStrategy` type (`"replace" | "extend" | "override"`)
from `src/config/sections/templates.ts` and the `findConfigFile()` /
`parseFileContent()` / `deepMerge()` pipeline in the config loader.

### 7.6 Entity Generation Workflows

Entity generation — **character, world, location, item, npc** — is a first-class
workflow category, not a generic "entity generation" afterthought. These workflows
give the existing `/create` assistant command the **prompt preview, validation, and
confirmation gating** it currently lacks (see `TASK-assistant-gm-flows.md`: `/create`
inserts directly with no quality pipeline and no user approval). Image/video vary by
_model family_ (§7.1b); entity workflows vary by _entity shape_.

#### 7.6a Intent → Entity Workflow Mapping

`INTENT_PATTERNS` in `src/regex/intent.ts` already defines generation targets for four
entity types. Workflow templates bind to these targets 1:1, so `classifyIntent` routing
feeds straight into `WorkflowRunner.startWorkflow(...)`.

| Entity    | `intent.target` | In `INTENT_PATTERNS`? | Creation backend (dispatch)                                                    |
| --------- | --------------- | --------------------- | ------------------------------------------------------------------------------ |
| Character | `character`     | ✅ (L27)              | `src/assistant/commands/create.ts` → actor insert                              |
| World     | `world`         | ✅ (L48)              | world creation service                                                         |
| Location  | `location`      | ✅ (L41)              | world-location insert                                                          |
| Item      | `item`          | ✅ (L34)              | `POST /api/worlds/:worldId/items/generate-llm` (see `TASK-item-generation.md`) |
| NPC       | `npc`           | ❌ — needs new target | actor insert with `is_npc`                                                     |

**Decision (open):** add `npc` as a distinct `INTENT_PATTERNS` target (preferred — clean
separation, matches `epic-npcs.md`), OR route NPC generation through the `character`
target with an `is_npc: true` step default. Default to adding the `npc` target.

#### 7.6b Per-Entity Step Schemas

Each entity workflow defines its own `steps[]` collecting the fields the entity's data
model requires:

- **character**: identity (name/species/homeland/culture — see
  `FEAT-origin-capture-generation-seeding.md`), appearance, personality, backstory,
  motivation; `world_id` scope.
- **world**: theme/genre, tone, core conflict, geography sketch, magic/tech level.
- **location**: type (city/region/dungeon), environment/biome, notable features,
  connections/travel, resource profile.
- **item**: category, rarity range, stats intent, lore/flavor, tags/theme.
- **npc**: role/function, faction allegiance (see `epic-faction-reputation.md`),
  personality, relationship to player/other actors.

#### 7.6c Entity Type Presets (analogous to §7.1b)

A companion `entity_type_presets` config block defines per-entity prompt formatting,
required-field validation, and consistency gates — the entity analog of
`model_family_presets`:

```yaml
# configs/templates/workflows/entity-types.yaml
merge: extend
entity_type_presets:
  character:
    required_steps: [identity, appearance, personality]
    validation:
      identity.name: { min_length: 1, max_length: 120 }
      identity.homeland: { max_length: 120 }
    consistency_gates:
      - type: duplicate # no two actors with same name + world_id
      - type: schema # matches actors table NOT NULL / FK
    dispatch_target: actor-insert
  item:
    required_steps: [category, rarity, stats_intent]
    validation:
      rarity: { options: [common, uncommon, rare, epic, legendary] }
    consistency_gates:
      - type: schema
      - type: balance # stats within world progression curve
    dispatch_target: item-generate-llm
```

#### 7.6d Quality Gates for Entities

Entity workflows reuse `approval.quality_gates` from §7.1 but add entity-specific checks:

- `schema` — assembled entity satisfies the target table's constraints (NOT NULL, FK to
  `world_id`, enum domains).
- `consistency` — new entity does not contradict existing entities in the same
  `world_id` (e.g. duplicate name, impossible geography).
- `duplicate` — no near-identical existing entity (name + key attributes).
- `balance` (items/loot only) — stats within the world's progression curve (see
  `epic-rarity-extensions.md`, `TASK-item-generation.md`).

#### 7.6e Relationship to `/create`

`/create` (via `src/assistant/commands/create.ts`) currently performs inline, ungated
entity generation. The workflow system is the **gating + UX layer** that wraps it:

```
/create character "..."  →  intent.target = character
  → matches character-generation workflow
  → preview steps + recommendations (7.6b)
  → validate each step (7.6c)
  → final confirmation (approval gate)
  → dispatch → /create backend (actor insert)
```

This closes the `TASK-assistant-gm-flows.md` gap (no quality validation / no confirmation
gating) without forking the creation backends. Entity workflows are the _only_ sanctioned
path for assistant-driven entity creation post-MVP.

#### 7.6f Example: Character Generation Workflow

```yaml
# configs/templates/workflows/character-generation.yaml
merge: extend
workflows:
  character-generation:
    id: character-generation
    name: "Character Generation"
    description: "Guided character creation with validation + confirmation"
    category: "entity"
    version: "1.0.0"
    intent:
      type: generate
      target: character
      confidence_threshold: 0.6
      requires_approval: true
      triggers:
        - "create.*character"
        - "generate.*character"
        - "new character"
    steps:
      - id: identity
        name: "Identity"
        type: prompt
        required: true
        recommendations:
          - "Specify species, homeland, and culture for lore-bearing identity"
        validation:
          min_length: 5
          max_length: 400
      - id: appearance
        name: "Appearance"
        type: prompt
        required: false
        default: "humanoid, default attire"
      - id: personality
        name: "Personality"
        type: prompt
        required: true
      - id: world_scope
        name: "World"
        type: select
        required: true
        source: worlds # populated from user's worlds
    dispatch:
      backend: tool_exec
      target: create-character
      endpoint: /api/assistant/create
    approval:
      type: confirm
      preview: true
      quality_gates:
        - type: schema
        - type: consistency
        - type: duplicate
```

Analogous workflow files exist for `world-generation`, `location-generation`,
`item-generation`, `npc-generation` (see the per-entity subtickets).

#### 7.7 Gallery Batch Operations

The gallery UI (`src/frontend/…/gallery-sidebar.html`, `partials/gallery/preview-modal.html`)
renders `galleryAssets[]` with per-item **click-to-preview**, copy-URL, download, delete — but
there is **no selection state**. Batch operations add a selection layer:

- **Selection model** — `selectedAssetIds: string[]` in the chat Alpine store, a **peer array
  to `galleryAssets`** (`src/frontend/alpine/chat-types/core.ts` / `chat-utils/gallery.ts`) so
  Alpine `x-for` iterates it directly (a `Set` would not render — use `[...selectedAssetIds]` if a
  Set is preferred). Toggled via checkbox, shift-click range, "select all visible". UI-only; not
  persisted server-side by default.
- **View (where it renders)** — per-item checkboxes + a batch-action bar are added to
  `src/components/chat/gallery-sidebar.html` (modify), backed by the `selectedAssetIds` state in
  `chat-utils/gallery.ts`. No new component file required for v1.
- **Batch download** — collect selected IDs → `POST /api/assets/batch-download`. Handler lives in
  a new `src/routes/assets.ts` (export `assetsRoutes`, mount in `src/elysia-app.ts` alongside the
  existing inline `POST /api/assets`), returns a server-side zip stream (keeps auth + bandwidth
  local). Client-side zip is a fallback only if the server endpoint is absent.
- **Batch actions (v1 scope: download + delete)** — move-to-world / attach-to-message / tag /
  export are future workflows over the selection set, explicitly out of v1.
- **Gates** — batch download honors NSFW rating visibility (omit/restrict un-consented NSFW) and
  asset ownership/scope.

Step schema (modeled as an optional `gallery-batch` workflow): selection source (current gallery /
search results / world), filters (type, date, rating), action.

#### 7.8 Gallery Edit Workflows

**Separate implementation scope** from §7.6 (entity) and §7.7 (batch). It wraps the **already
implemented** `src/image-edit/` subsystem as a workflow UX layer — same pattern as §7.6 wraps
`/create`. Do **not** re-implement image editing; dispatch to `src/image-edit/routes.ts`.

`src/image-edit/` today (`index.ts`, `template-registry.ts`, `providers/{comfyui, sd-server}`,
`templates/builtin/{txt2img, img2img, inpaint, controlnet, upscale, lora}.ts`):

- **Asset → edit workflow binding** — open an asset, choose "Edit" → edit workflow keyed by asset
  type: image → `img2img` / `inpaint` / `controlnet` / `upscale` / `lora`; video → video-to-video
  (Minimax H3 / Wan / LTX if edit-capable).
- **Edit-capable model families** (extend §7.1b):
  - `flux-kontext` — instruction edit ("change X to Y"), no init-image weighting.
  - `qwen-edit` — **dual mode**: `t2i` (generation, inherits `qwen-image` formatting) **and**
    `i2i` (edit via `edit-instruction`). Clarification 2026-08-12: qwen-edit serves BOTH generation
    and edit; the workflow selects mode at dispatch (see §7.1b preset `modes`).
  - SD-server / ComfyUI builtins `img2img`, `inpaint`, `controlnet`, `upscale`, `lora` —
    `backend: comfyui | sd-server`, chosen by `required_nodes`.
  - `sdxl` (+variants) edit via `img2img`/`inpaint` + ControlNet/LoRA **parameter add-ons** (not
    distinct families).
  - **Needs research (flagged `?` in request):** `klein` — absent from §7.1b presets; confirm
    whether it is an edit-capable backend or a naming variant before adding a preset. `minimax-h3`
    is a **video** family (§7.1b); video edit = video-to-video — confirm img2img-style edit support
    before claiming image-edit parity.
- **ControlNet / LoRA** — modeled as **template parameters** inside `img2img`/`inpaint`
  (OpenPose/Depth/Canny preprocessors, LoRA stack), not separate workflows. The builtin
  `controlnet.ts` + `lora.ts` templates already define these.
- **Workflow shape** — pick template (img2img/inpaint/controlnet/upscale/lora), bind source asset
  as `input_image`, collect prompt + template params (denoise, controlnet weights, lora weights),
  preview, confirm, dispatch to `POST /api/image-edit/run`; result adds a new gallery asset (or
  replaces, per policy).
- **Quality gates** — `schema` (valid `input_image` + prompt), `consistency` (asset within world
  scope / ownership), `duplicate` (same source + params → warn), NSFW policy reuse.
- **Dispatch separation** — edit workflows set `backend: image_edit` → `src/image-edit/routes.ts
  handleRun`, **not** the generation pipeline. This is the key boundary vs §7.1 generation workflows.

---

## Use Case: Minimax H3 Video Generation (End-to-End Walkthrough)

1. **User** types: _"Generate a 5-second video of a cyberpunk samurai drawing his sword in the rain."_

2. **Intent detection** (`classifyIntent` in `src/generation/auto-gen.ts:74`):
   - Matches `minimax` + `video` triggers in `INTENT_PATTERNS`.
   - Routes to `minimax-h3-video` workflow template.

3. **Assistant creative studio** (`src/assistant/workflow-runner.ts`):
   - Loads `configs/templates/workflows/minimax-h3-video.yaml`.
   - Previews 3 steps: Scene Description, Motion & Style, Parameters.
   - Displays recommendations for each step.

4. **Step-by-step prompting**:
   - Step 1: "Describe the visual scene…" — user fills, assistant validates
     (min 10 chars, max 500 chars), recommends adding lighting details.
   - Step 2: "Motion & style…" — user fills, assistant recommends cinematic terms.
   - Step 3: "Parameters" — auto-filled duration=5, resolution=1080p, frame_rate=30
     (from template defaults), user confirms.

5. **Final confirmation**: shows assembled prompt + payload summary.
   - User confirms → dispatch to `POST /api/generation/video` with Minimax H3 backend.
   - User cancels → abort.

6. **Dispatch** → `src/generation/llm-queue.ts` (via `epic-llm-queue.md` for throughput
   scheduling) → Minimax H3 provider → result attached to chat as video asset.

---

## Use Case: Nano Banana Image Generation w/ NSFW Prefiltering

1. **User** types: _"Create a spicy portrait of my character in lingerie."_

2. **Intent detection**: matches `nano.banana` + `image` triggers in `INTENT_PATTERNS`.
   Routes to `nano-banana-image` workflow template (model_family: `z-image`).

3. **NSFW prefilter** (before step building):
   - `classifyIntent` detects sexual/NSFW content.
   - Workflow's `dispatch.nsfw_policy` specifies: `classification_required: true`,
     `allowed: true` (Nano Banana accepts NSFW-labeled), `consent_required: true`.
   - Assistant asks: "This request may contain NSFW content. Nano Banana accepts
     NSFW-labeled requests. Do you consent to proceed with NSFW labeling?"

4. **User consents** → step-by-step prompt building proceeds:
   - Step 1: Subject (character description) — validated against Z-Image prompt format (tags).
   - Step 2: Style (lingerie style, lighting) — recommendations applied.
   - Step 3: Parameters — steps=30, cfg=7, size=1024x1024 (from `z-image` preset).

5. **Final confirmation**: shows formatted prompt (`character tags, lingerie tags, rating:explicit`)
   - NSFW label attached to payload.

6. **Dispatch** → `POST /api/generation/third-party` → Nano Banana backend → result
   attached to chat as image asset, labeled with NSFW rating tag.

---

## Current State (2026-08-08)

### What exists (foundation to build on)

| Component                                  | Status                  | Location                                                          |
| ------------------------------------------ | ----------------------- | ----------------------------------------------------------------- |
| Config template loader                     | ✅ Shipped              | `src/config/templates-loader.ts`, `sections/templates.ts`         |
| Merge strategies (replace/extend/override) | ✅ Shipped              | `src/config/sections/templates.ts`                                |
| `AssistantIntent` taxonomy                 | ✅ Shipped              | `src/regex/intent.ts:11`                                          |
| `INTENT_PATTERNS` keyword array            | ✅ Shipped              | `src/regex/intent.ts:17-97`                                       |
| `classifyIntent` (LLM)                     | ⚠️ Partial               | `src/generation/auto-gen.ts:74` (no timeout, no apiKey, temp 0.1) |
| Slash command parser + registry            | ✅ Shipped              | `src/assistant/command-parser.ts`, `commands/registry.ts`         |
| Prompt assembler (section pipeline)        | ✅ Shipped              | `src/assistant/prompt-assembler.ts`                               |
| `SDRequest` / `generateImage`              | 🟡 Dead stub            | `src/assistant/sd.ts` (no provider wiring)                        |
| `ScenarioSource` store + bridge            | 🟡 Dead stub            | `src/assistant/scenario-source.ts` (no DB table)                  |
| `/image` command                           | 🟡 Action dispatch only | `src/assistant/commands/image.ts` (832 bytes)                     |
| Dead `detectIntent()`                      | ✅ Removed 2026-08-07   | `src/assistant/intent.ts` (see `.plan/backlog/open.md` row 4)     |

### What needs building

| Layer                | Item                                                                     |
| -------------------- | ------------------------------------------------------------------------ |
| Schema               | Workflow template types in `sections/templates.ts`                       |
| Loader               | Workflow template loading in `templates-loader.ts`                       |
| Model family presets | `configs/templates/workflows/model-families.yaml` + formatter engine     |
| Intent routing       | Extend `INTENT_PATTERNS` with workflow triggers                          |
| Runner               | `src/assistant/workflow-runner.ts` (start/preview/step/confirm/dispatch) |
| Defaults             | `configs/templates/workflows/defaults.yaml` (in-source)                  |
| Dispatch             | Wire to `/api/generation/video` + existing generation providers          |
| Frontend             | Creative studio step UI + confirmation modal                             |
| Third-party APIs     | Integration framework for Minimax H3, Nano Banana, etc. (see TASK)       |
| NSFW prefiltering    | Per-backend NSFW policy + consent (see TASK)                             |
| Tests                | Workflow loader, step validation, intent matching                        |

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

### NSFW Handling for Workflows

Third-party image/video generation APIs (Minimax H3, Nano Banana, Ideogram 4, etc.) enforce
NSFW restrictions differently — some reject NSFW outright, some require explicit labeling,
and some allow it with moderation flags. The workflow system must handle this at dispatch time:

| Concern                | Approach                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Content classification | Workflow `dispatch` includes an `nsfw_policy` field with per-backend rules                                             |
| Prefiltering           | Run the assembled prompt through the NSFW moderation service before dispatch (`src/nsfw/`)                             |
| Internal labeling      | If NSFW content is detected and the backend allows it, attach the NSFW content rating tag to the payload               |
| Rejection routing      | If the backend rejects NSFW, route to an alternative NSFW-capable backend or notify the user                           |
| User consent           | For NSFW-capable backends, require explicit consent (reuses `epic-nsfw-moderation-priority.md` consent infrastructure) |

Example `nsfw_policy` in a workflow template:

```yaml
dispatch:
  backend: api_call
  target: nano-banana
  endpoint: /api/generation/third-party
  nsfw_policy:
    classification_required: true # prefilter before dispatch
    allowed: true # backend accepts NSFW-labeled content
    consent_required: true # per-user consent gate
    label_field: nsfw_tag # field name in payload
    fallback:
      - backend: comfyui
      - backend: sd-server
```

## See `TASK-assistant-nsfw-api-prefiltering.md` for implementation.

## Tasks

- [ ] Define `WorkflowConfig` types in `src/config/sections/templates.ts`
- [ ] Entity-generation workflow templates (character/world/location/item/npc) with `entity_type_presets` (§7.6c) + per-entity quality gates (§7.6d); wire `intent.target` bindings (§7.6a)
- [ ] Add workflow template loading to `src/config/templates-loader.ts`
- [ ] Create `configs/templates/workflows/defaults.yaml` with Minimax H3 example
- [ ] Extend `src/regex/intent.ts` `INTENT_PATTERNS` with workflow trigger rules
- [ ] Add model family presets (`configs/templates/workflows/model-families.yaml`) + formatter engine
- [ ] Implement `src/assistant/workflow-runner.ts` (start/preview/step/confirm/dispatch)
- [ ] Implement step validation + recommendation engine
- [ ] Wire dispatch to `POST /api/generation/video` + existing generation pipelines
- [ ] Add NSFW policy field to dispatch + integrate with `src/nsfw/` moderation
- [ ] Frontend: creative studio step UI + confirmation modal
- [ ] Plugin extension point for assistant workflows
- [ ] Unit tests for loader, step validation, intent→workflow routing
- [ ] Integration test: Minimax H3 end-to-end (intent → steps → confirm → dispatch)
- [ ] Gallery batch operations: selection state in Alpine store (`selectedAssetIds`), batch download via `POST /api/assets/batch-download` (zip), v1 batch actions (download + delete), NSFW/ownership gates (§7.7)
- [ ] Gallery edit workflows: wrap `src/image-edit/` as workflow UX layer, asset→template binding, edit-capable family presets (flux-kontext, qwen-edit dual t2i/i2i, sdxl + controlnet/lora params), dispatch to `POST /api/image-edit/run` (§7.8)

---

## Files

| File                                                                     | Status                                     |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| `src/config/sections/templates.ts`                                       | modify                                     |
| `src/config/templates-loader.ts`                                         | modify                                     |
| `configs/templates/workflows/defaults.yaml`                              | new                                        |
| `configs/templates/workflows/model-families.yaml`                        | new                                        |
| `configs/templates/workflows/entity-types.yaml`                          | new (entity type presets, §7.6c)           |
| `src/regex/intent.ts`                                                    | modify                                     |
| `src/assistant/workflow-runner.ts`                                       | new                                        |
| `src/assistant/workflow-runner.test.ts`                                  | new                                        |
| `src/frontend/creative-studio/workflow.ts`                               | new                                        |
| `src/routes/generation/video.ts`                                         | new (dispatch target)                      |
| `configs/templates/workflows/third-party-adapters.yaml`                  | new (third-party API adapters)             |
| `src/routes/generation/third-party.ts`                                   | new (third-party API dispatch)             |
| `.plan/tickets/TASK-assistant-creative-studio-workflows.md`              | new                                        |
| `.plan/tickets/TASK-assistant-third-party-api-integration.md`            | new                                        |
| `.plan/tickets/TASK-assistant-nsfw-api-prefiltering.md`                  | new                                        |
| `src/frontend/alpine/chat-utils/gallery.ts` (selection store)            | modify                                     |
| `src/routes/assets.ts` — `POST /api/assets/batch-download` handler (zip) | new (mount in `src/elysia-app.ts`)         |
| `src/assistant/workflows/gallery-edit.ts`                                | new (edit workflow UX over src/image-edit) |
| `configs/templates/workflows/gallery-edit.yaml`                          | new                                        |

---

## Acceptance Criteria

- [ ] Workflow templates are config-driven (YAML in `configs/templates/workflows/`)
- [ ] User intent matches a workflow template and triggers the creative studio flow
- [ ] Assistant previews prompt steps + recommendations before building
- [ ] Step-by-step prompt construction with validation + recommendations
- [ ] Final confirmation required before dispatch
- [ ] Dispatch calls the designated backend/API with assembled payload
- [ ] Default workflows cover media: video generation, image generation, image editing
- [ ] Entity-generation workflows (character/world/location/item/npc), each with: intent routing to its `INTENT_PATTERNS` target, per-entity step schema (§7.6b), `entity_type_presets` validation (§7.6c), schema/consistency/duplicate (+balance for items) quality gates, confirmation, and dispatch to the correct creation backend
- [ ] Model family presets handle per-family prompt formatting (SD tags, Flux natural, Ideogram JSON, etc.)
- [ ] NSFW prefiltering + labeling + consent gate wired for third-party API backends
- [ ] User can add/override/replace workflows via config (merge strategies work)
- [ ] Plugin can register additional workflows
- [ ] Applicable to other assistant workflows (not just one use case)
- [ ] Tests passing
- [ ] Gallery supports multi-select + batch download (server-zip) with NSFW/ownership gating (§7.7)
- [ ] Gallery edit workflows route to `src/image-edit/` (not the generation pipeline), cover img2img/inpaint/controlnet/upscale/lora, and support `qwen-edit` dual t2i + i2i mode (§7.8)

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
- `src/regex/intent.ts` — `AssistantIntent`, `INTENT_PATTERNS`, `SLASH_COMMAND`
- `src/assistant/intent.ts` — `detectAvatarChangeIntent` (config-driven pattern matching)
- `src/assistant/command-parser.ts` — slash command parsing (`BUILTIN_COMMANDS`)
- `src/assistant/commands/registry.ts` — `CommandContext`, `CommandResult`, `registerCommand`
- `src/assistant/prompt-assembler.ts` — ordered section pipeline (pattern to follow)
- `src/assistant/sd.ts` — dead `SDRequest` / `generateImage` stubs (to replace)
- `src/assistant/scenario-source.ts` — dead `ScenarioSource` stubs (to activate)
- `src/assistant/commands/image.ts` — current `/image` action dispatch (832 bytes)
- `src/generation/auto-gen.ts:74` — `classifyIntent` LLM routing (needs timeout/apiKey fix)
- `docs/spec/creative-studio.md` — creative studio spec (stub)
- `docs/spec/assistant-commands.md` — command spec (may drift)
- `configs/templates/llm.example.yaml`, `sd.example.yaml`, `avatar.example.yaml`,
  `image-edit.example.yaml`, `character.example.yaml`, `expansion.example.yaml` —
  existing template example files (pattern to follow)
- `.plan/backlog/open.md` § Dead / unwired code — `detectIntent` removal (row 4),
  `scenario-source.ts` + `sd.ts` dead stubs (row 10)
- `.plan/epics/epic-config-templates.md` — template system design doc
- `.plan/tickets/TASK-assistant-command-execution-intent-detection.md` — intent detection task
- `.plan/tickets/TASK-assistant-generation-extensions.md` — image/audio backend providers
- `.plan/tickets/TASK-assistant-third-party-api-integration.md` — Nano Banana + third-party API dispatch
- `.plan/tickets/TASK-assistant-nsfw-api-prefiltering.md` — NSFW prefiltering + consent + labeling
- `.plan/tickets/TASK-assistant-creative-studio-workflows.md` — this epic's implementation task
