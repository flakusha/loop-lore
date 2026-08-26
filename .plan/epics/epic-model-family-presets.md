<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Model Family Presets

**Status:** ⬜ Not Started
**Priority:** High (MVP scoped, post-Gate C)
**Effort:** Medium
**Type:** Feature Epic / Configuration
**Tags:** assistant, workflows, model-families, yaml, prompt-formatting
**Parent Epic:** Assistant Creative Studio — Workflow Templates (epic-assistant-creative-studio-workflows.md)
**Depends on:** Workflow Engine (`epic-workflow-engine.md`)

## Summary

Per-model-family prompt formatting, validation constraints, parameter schemas, and recommendation presets — authored as `configs/templates/workflows/model-families.yaml` and applied by the formatter engine at workflow dispatch. **Config-heavy, low-code**: the bulk of this epic is YAML authoring for the 17 model families; the only code is the formatter application hook in the runner's Phase 2b.

## Design (§7.1b)

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

### Model Family Reference

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

### Formatter Application at Dispatch

The engine's Phase 2b (`epic-workflow-engine.md` runtime flow) applies the family
preset's formatter per step:

- **tags** — comma-separated, weighted `(word:1.3)`, no natural prose (SD 1.5, Z-Image).
- **mixed** — natural-language description + weighted tags at the end (SDXL & variants).
- **natural** — full sentences; no weighting; avoid "masterpiece"-style spam (Flux, Wan, LTX).
- **edit-instruction** — "change X to Y" phrasing (flux-kontext, qwen-edit i2i mode).
- **json** — structured JSON payload validated against the preset's `json_schema`
  (ideogram-4); not concatenated as free text.
- Presets support `extends:` inheritance (e.g. `sd-xl-noob extends sdxl`) and dual-mode
  families via a `modes:` field (`qwen-edit`: `[t2i, i2i]`) — the workflow selects mode
  at dispatch.

## Tasks

- [ ] Add model family presets (`configs/templates/workflows/model-families.yaml`) + formatter engine

Task breakdown (same deliverable, sequenced):

1. Author `model-families.yaml` covering all 17 families from the reference table
   (format rules, token limits, weight syntax, negative-prompt support, parameter
   schemas, recommendations).
2. Implement the formatter engine that applies `prompt_format` to raw step input at
   dispatch, honoring `extends` inheritance and `modes`.
3. Validate presets against the acceptance criterion: "Model family presets handle
   per-family prompt formatting (SD tags, Flux natural, Ideogram JSON, etc.)".


- [ ] Model family presets handle per-family prompt formatting (SD tags, Flux natural, Ideogram JSON, etc.)
## Dependencies

- **Parent hub:** Assistant Creative Studio — Workflow Templates (`epic-assistant-creative-studio-workflows.md`)
- **Requires:** `epic-workflow-engine.md` — presets are consumed by the runtime flow's
  Phase 2b format transformation and referenced by `workflow.model_family`.
- **Siblings:** `epic-entity-generation-workflows.md` mirrors this pattern for entity
  types (`entity_type_presets`); `epic-gallery-batch-operations.md` is unaffected.

## Related Epics

- `epic-audio-video-sound.md` — Minimax H3/Wan/LTX video backends these presets target
- `epic-comfyui-plugin.md` / `epic-assistant-generation-extensions.md` — SD/ComfyUI backends
