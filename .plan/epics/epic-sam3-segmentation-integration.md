<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: SAM3 / SAM3.1 Integration — Concept Segmentation for Generation

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Drafted 2026-10-16 (planning branch `sam3-integration`). Integration path (A ComfyUI vs B direct) is pending the feasibility probe — `TASK-sam3-model-api-and-comfyui-node-feasibility-probe`.
**Priority:** high
**Effort:** High
**Type:** Feature Epic
**Tags:** segmentation, sam3, comfyui, matting, image-edit, sprite-pipeline, model-api

## Overview

SAM 3 / SAM 3.1 (Meta, Nov 2025) is a unified detection + segmentation +
tracking model driven by **concept prompts**: a short noun phrase (
"cloaked figure", "warhorse") returns a box and a mask for every match, with
exemplar-image and visual-point prompts also supported ([Meta SAM 3](https://ai.meta.com/sam3),
[SAM 3.1 model page](https://developer.meta.com/ai/models/sam-3-1),
[Meta Model API docs](https://ai.developer.meta.com/docs/sam/overview)).

Loop Lore generates a lot of pixels — emotion avatars, image-edit results,
2D sprites, VN scene art — but has no *object or region awareness* anywhere
in the generation stack: masks are hand-authored per template
(`src/image-edit/templates/builtin/`) and matting is promptless
(`MattingProvider.removeBackground(buffer)` cuts out "the subject" by
heuristic). This epic adds segmentation as a first-class generation
capability so prompts like "remove the character holding the lantern"
resolve to a mask without a per-template hand-drawn one.

## Integration paths

Both paths reuse decisions already settled in `epic-comfyui-plugin.md`
(ComfyUI REST contract is fixed; workflow JSON is the API contract) and the
image-provider config + `pickSdProvider` selection pattern ComfyUI and
sd-server already use. **Ship one path, not both** — the initial target comes
from the probe ticket.

### Path A — ComfyUI (default; no engine change)

- SAM 3 enters as **workflow nodes** (community custom-node packs); the
  composite graph is shipped as workflow templates in the existing in-place
  system — the same Path A `epic-comfyui-plugin.md` picked for image-engine
  and image-edit.
- New templates: `sam3-concept-mask` (image + concept → mask),
  `concept-inpaint` (SAM3 mask → inpaint), `concept-cutout` (SAM3 mask →
  alpha matte). Consumed via `substituteWorkflow` + `applyNodeOverrides`.
- **Hard prerequisites** (first-class-citizen defects that break real graphs):
  numeric `{{var}}` substitution (`TASK-comfyui-workflow-parameterization`,
  Defect 1), node-id allocation (`TASK-comfyui-node-id-allocation`,
  Defect 2), parameter validation (`TASK-comfyui-template-parameter-validation`,
  Defect 5). A SAM3 mask feed is all-integer node wiring — it regresses the
  moment those land unfixed.
- **Operator caveat:** SAM3 nodes are community custom nodes. Workflow
  ingest validation must reject a graph whose required node classes are
  missing from `/object_info` with an actionable message (the `isValidWorkflow`
  gap, Defect 3), not a cryptic ComfyUI 400.

### Path B — Direct

- **B1 Meta Model API (SAM 3.1, hosted):** DETR-style perception served by
  Meta; bearer-token auth; image + concept prompt in, boxes/masks out
  (encoding per the probe — request/response shape is not yet pinned).
- **B2 local SAM 3 open weights:** the weights are open, but this repo has no
  Python/ONNX inference runtime and no sidecar service; adding one is a
  deployment-shape decision that belongs to `epic-byok-local-models.md`.
  Do not build B2 inside this epic.
- Path B lands on the **image-domain seams, not the LLM provider registry**:
  an `ImageProviderConfig` entry under `config.generation.providers.sd[]`
  selected with `pickSdProvider(providers, "edit")`
  (`src/config/schema/sd-provider.ts`, the same selection ComfyUI and
  sd-server entries use), and for cutouts a `MattingProvider`
  (`src/generation/matting/providers.ts`) wired in
  `src/generation/matting/factory.ts`. `src/generation/providers/registry.ts`
  (`registerProvider` / `resolveProvider` / `buildFailoverList` /
  `callWithFailover` + circuit breaker) is LLM-shaped — it registers
  `LLMProvider` instances carrying `GenerateRequest` — and must not be
  extended with image providers.

**Decision rule:** Path A when a ComfyUI backend is configured; Path B is
opt-in config plus fallback. The probe ticket records the evidence and the
initial choice; this epic is updated with a settled decision before any
implementation ticket starts.

## Why segmentation, here (grounded in current code)

| Seam | Today | With SAM3 |
| ---- | ----- | --------- |
| Matting | `src/generation/matting/types.ts` — `removeBackground(buffer)`, promptless rembg-class heuristic | Concept prompt ("the character") gives a deterministic target; contract gains an optional prompt (`TASK-matting-concept-prompt-contract`) |
| Image-edit inpaint | Masks hand-authored per builtin template (`src/image-edit/templates/builtin/`) | Concept mask at run time — "remove the second character" becomes a parameter (`TASK-image-edit-concept-inpaint-template`) |
| Emotion avatars | `enqueueAutoMatting` fires promptless after every generation (`src/generation/matting/auto-matte.ts`) | Same cutout, concept-scoped and consistent across the emotion batch (`TASK-sam3-concept-cutout-wiring-sprites-avatar-matting-vn-alpha`) |
| Sprites / VN alpha | Consumers already flagged but mask-less (`TASK-comfyui-first-class-sprite-pipeline-avatar-matting-workflows`, `TASK-vn-alpha-extraction-matting-job-for-opaque-character-images`) | Concept cutout produces alpha derivatives per actor/emotion |
| Asset store | Derivatives link via `asset_links`, dedup by content hash | Masks and cutouts are ordinary derivative assets; same dedup applies (`TASK-sam3-mask-cache-and-reuse`) |

## Relations (existing epics)

| Epic | Relation |
| ---- | -------- |
| `epic-comfyui-plugin.md` | Hosts Path A: client, substitutor, template registry, the in-place decision this epic inherits |
| `epic-comfyui-first-class-citizen.md` | Prerequisite defects (numeric substitution, node-id allocation, validation) must land first; workflow-library rows carry the required-node list |
| `epic-2d-sprite-world.md` | Sprite-pipeline sub-epic is the primary consumer of concept cutouts |
| `epic-avatar-regeneration-control.md` | Auto-matte call sites it ships become concept-scoped; re-rolls re-derive the matte |
| `epic-avatar-alpha-vn-layering.md` | VN layering consumes alpha assets this epic can produce on demand |
| `epic-asset-platform-capabilities.md` | Derivative assets + dedup own storage of masks/cutouts; encryption-tier and ownership rules apply unchanged |
| `epic-assistant-generation-extensions.md` | `/image edit` flows gain concept-driven editing once templates exist |
| `epic-e2e-integration-testing.md` | Fake-ComfyUI server pattern gives deterministic coverage without a real SAM3 node pack |
| `epic-byok-local-models.md` | If local SAM 3 weights are ever wanted, the runtime belongs there, not here |
| `epic-distributed-compute-sharing.md` | Segmentation is a GPU-heavy task — a candidate workload only; no coupling in v1 |

## Tickets (this epic)

| Ticket | Scope | Depends on |
| ------ | ----- | ---------- |
| `TASK-sam3-feasibility-probe-meta-model-api-vs-comfyui-custom-node` | Probe both paths; pick the initial target; record evidence | — |
| `TASK-matting-concept-prompt-contract` | Extend `MattingProvider` / jobs / config with an optional concept prompt | — |
| `TASK-comfyui-sam3-concept-mask-template` | `sam3-concept-mask` workflow template + parameter form + ingest validation | probe, contract; `TASK-comfyui-workflow-parameterization`, `TASK-comfyui-node-id-allocation` |
| `TASK-image-edit-concept-inpaint-template` | `concept-inpaint` template + routes + authz | mask template; `TASK-comfyui-first-class-mount-image-edit-routes-verify-asset-per` |
| `TASK-sam3-direct-provider-via-meta-model-api` | SAM 3.1 direct image-provider entry (Model API) via `pickSdProvider` / `MattingProvider` | probe, contract |
| `TASK-sam3-concept-cutout-wiring-sprites-avatar-matting-vn-alpha` | Wire concept cutout into sprite pipeline, avatar auto-matte, VN alpha | contract + one path; `TASK-vn-alpha-extraction-matting-job-for-opaque-character-images` |
| `TASK-sam3-mask-cache-and-reuse` | Mask cache keyed by (asset hash, concept, model) | contract, mask template |

## Open questions

- **Mask storage:** derived asset + `asset_links` derivative row (consistent with
  image-edit) vs ephemeral buffer. Leaning derived-asset — masks are reusable
  across edits and the dedup/GC rules already exist. Settled by the cache ticket.
- **Concept-vs-occlusion quality:** SAM3 concept masks will include partial
  overlapping matches; inpaint templates need a max-matches / confidence knob.
  Carried as template parameters, not a service change.
- **Authz:** masks derive from user assets, so image-edit ownership and
  chat-access scoping (`src/image-edit/run-authz.ts`) apply to every new route.
- **Tracking is out of scope:** v1 is images only; video segmentation/tracking
  needs a job+stream story that no current surface consumes.

## Non-goals

- Replacing the default heuristic matting provider (rembg stays the default
  when no concept is configured).
- Training or fine-tuning segmentation weights.
- Video tracking, real-time segmentation.
- Local SAM 3 weights runtime (B2) — belongs to `epic-byok-local-models.md`.

## Related

- [`TASK-sam3-feasibility-probe-meta-model-api-vs-comfyui-custom-node.md`](../tickets/TASK-sam3-feasibility-probe-meta-model-api-vs-comfyui-custom-node.md)
- [`TASK-matting-concept-prompt-contract.md`](../tickets/TASK-matting-concept-prompt-contract.md)
- [`TASK-comfyui-sam3-concept-mask-template.md`](../tickets/TASK-comfyui-sam3-concept-mask-template.md)
- [`TASK-image-edit-concept-inpaint-template.md`](../tickets/TASK-image-edit-concept-inpaint-template.md)
- [`TASK-sam3-direct-provider-via-meta-model-api.md`](../tickets/TASK-sam3-direct-provider-via-meta-model-api.md)
- [`TASK-sam3-concept-cutout-wiring-sprites-avatar-matting-vn-alpha.md`](../tickets/TASK-sam3-concept-cutout-wiring-sprites-avatar-matting-vn-alpha.md)
- [`TASK-sam3-mask-cache-and-reuse.md`](../tickets/TASK-sam3-mask-cache-and-reuse.md)
- [`epic-comfyui-plugin.md`](./epic-comfyui-plugin.md) — Path A host epic
- [`epic-comfyui-first-class-citizen.md`](./epic-comfyui-first-class-citizen.md) — prerequisite defects
- [`epic-2d-sprite-world.md`](./epic-2d-sprite-world.md) — sprite-pipeline consumer
- [`epic-avatar-regeneration-control.md`](./epic-avatar-regeneration-control.md) — auto-matte consumer
- [`epic-avatar-alpha-vn-layering.md`](./epic-avatar-alpha-vn-layering.md) — alpha consumer
- [`epic-asset-platform-capabilities.md`](./epic-asset-platform-capabilities.md) — derivative storage owner
- [`epic-e2e-integration-testing.md`](./epic-e2e-integration-testing.md) — fake ComfyUI coverage
- [`epic-byok-local-models.md`](./epic-byok-local-models.md) — local-weights runtime boundary
- [`epic-derived-map-generation.md`](./epic-derived-map-generation.md) — consumer: depth maps, texture sets, multi-mask cutouts, and provenance links build on the concept-mask contract


git issue: b6fd26b
