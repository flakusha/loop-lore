<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: ComfyUI Plugin & Workflow Templates

**Status:** 🟡 Partial — ComfyUI integration shipped across **two** surfaces (generation image-engine + image-edit template system). Builtin TS templates, node discovery (`/object_info`), config-driven workflows, and `/api/image-edit/*` routes exist. **Blocking gaps:** image-edit routes are NOT mounted; `ComfyUIEditProvider.execute` emits dangling asset links (never downloads/stores the image); `submitWorkflow` omits `client_id` (no WebSocket progress, ambiguous multi-client scoping). GGUF model loading + FLUX.1 Kontext / Qwen Edit templates pending.
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** comfyui, plugin, workflow, image-generation, templates, api
**ComfyUI Status:** First-class citizen

## Overview

ComfyUI is the primary integration target for image generation and editing.
Workflow files (JSON on disk **and** TypeScript `build()` functions) are the API
contract for endpoint calls. This epic extends the existing ComfyUI client
(`src/generation/providers/comfyui.ts`) into a full plugin system with
executable workflow templates.

The client can already submit raw workflow JSON. On top of it, two consumption
surfaces now exist (see **Integration Paths**). The remaining work is (a) closing
the blocking gaps below, and (b) authoring the high-value usecase templates
(FLUX.1 Kontext, Qwen Edit, Krea 2) **in place** — no new API-call shape required.

## Integration Decision — In-place template vs custom API call (2026-08-25)

**Question:** For new ComfyUI usecases (FLUX.1 Kontext, Qwen Edit, Krea 2,
emotion avatars), do we modify the existing API call in-place, or build a
custom API call?

**Decision: In-place. No custom API-call shape.**

- The ComfyUI REST contract is fixed: `POST /prompt`, `GET /history/{id}`,
  `POST /interrupt`, `GET /object_info`, `GET /view`, and `/ws` (progress).
  `ComfyUIClient` (`src/generation/providers/comfyui.ts`) already implements
  every one of these except `/ws`.
- New usecases are expressed as **workflow templates consumed by the existing
  call**, not as new endpoints:
  - **Path A (production):** add a `{{placeholder}}`-substituted JSON to
    `configs/workflows/`. `WorkflowLoader` auto-discovers it (scans `*.json`),
    `substituteWorkflow` fills vars + `applyNodeOverrides` applies node-targeted
    overrides, then `generateComfyUI` → `ComfyUIClient.runWorkflow` runs it.
    Used by `image-gen-route` and `emotion-avatar-service`. **Zero API-call
    code change** — this is the canonical "in-place" path.
  - **Path B (UX):** add a TS `WorkflowTemplate` (`build(params) =>
    ComfyUIWorkflow`) under `src/image-edit/templates/builtin/`, register it in
    `templateRegistry`; it renders as a parameter form via `/api/image-edit/*`.
- The only justified change to the API call itself is **additive**: an optional
  `client_id` in the `/prompt` body (enables `/ws` progress and scopes
  executions across clients). Still in-place.
- **Custom API call** is only warranted for a ComfyUI *extension* endpoint
  (a custom node's HTTP route). Not our current usecase — defer.

## Integration Paths

### Path A — generation image-engine (production, asset-persisting)

- `src/generation/image-engine/comfyui.ts` → `generateComfyUI(sdConfig, opts)`
  loads a named workflow, optionally injects LoRA (`injectComfyUILora`), then
  `comfyClient.runWorkflow(workflow)` (submit → poll `/history` →
  `downloadImage`). Returns image buffers; the caller persists via
  `createAsset`/`linkAsset` (`src/assets/service`) — **assets are stored**.
- Driven by `src/generation/image-gen-route.ts` (`handleImageGeneration`,
  `workflow` param = filename in `configs/workflows/`) and
  `src/characters/services/emotion-avatar-service/generation.ts`
  (`generateImages`). This is the live path for emotion avatars.
- Workflow JSON templates: `configs/workflows/txt2img.json`,
  `configs/workflows/img2img.json` (use `{{prompt}}`, `{{input_image}}`,
  `{{width}}`, `{{seed}}`, … placeholders).

### Path B — image-edit template system (richer UX, currently broken)

- `src/image-edit/` — `ComfyUIEditProvider` wraps `ComfyUIClient`;
  `templateRegistry` + `builtinTemplates` (txt2img, img2img, inpaint, upscale,
  controlnet) as TS `WorkflowTemplate`s; `buildLoraNodes`/`parseLoraString`
  helpers; node discovery via `/object_info`.
- Routes `src/image-edit/routes.ts` (`/api/image-edit/run|templates|nodes|
  capabilities|health`) are **defined but NOT mounted** in the server/Elysia app
  (verified: zero imports/mounts outside `src/image-edit/`).
- **BLOCKING:** `ComfyUIEditProvider.execute` builds `ImageEditResult`s with
  `/api/assets/{uid}/raw` URLs where `uid()` is a fresh id that is **never
  downloaded or inserted as an asset** → the links are dangling/non-functional.
  (Path A does this correctly via `runWorkflow` + `createAsset`.)

## Practical Testing Results (2026-07-28)

First-hand testing on RX 7900 XT (20GB VRAM):

| Model                   | Status          | Notes                                                              |
| ----------------------- | --------------- | ------------------------------------------------------------------ |
| Qwen Image Edit         | Works, decent   | Slow, >20GB real usage, needs layer rotation                       |
| Krea 2 Edit             | Not working     | Samples look good, needs retest                                    |
| Klein 4B/9B             | Strange results | Possibly setup issue, needs investigation                          |
| FLUX.1 Kontext          | Not tested      | High priority — sd.cpp supports at 4-6GB VRAM                      |
| ControlNet + inpainting | Minor testing   | Low priority, users prefer Krita                                   |
| IP-Adapter              | Not tested      | Mostly for older SD/SDXL models                                    |
| LoRA                    | Works           | sd.cpp: prompt injection. ComfyUI: LoraLoader node. Coeff 0.3-0.7. |

## Current State

| Area                | File                                              | State    | Notes                                                          |
| ------------------- | ------------------------------------------------- | -------- | -------------------------------------------------------------- |
| ComfyUI HTTP client | `src/generation/providers/comfyui.ts`             | ✅ Built | submit/poll/download/`getNodeInfo` (NO `client_id`, NO `/ws`)   |
| Image gen engine    | `src/generation/image-engine/comfyui.ts`          | ✅ Built | `generateComfyUI`: load → LoRA inject → `runWorkflow` → buffers |
| Workflow loader     | `src/generation/workflow-loader/loader.ts`        | ✅ Built | auto-discovers `configs/workflows/*.json`, substitutes vars    |
| On-disk templates   | `configs/workflows/{txt2img,img2img}.json`         | ✅ Built | `{{placeholder}}` substitution                                  |
| Image gen route     | `src/generation/image-gen-route.ts`               | ✅ Built | sd-server + ComfyUI (`workflow` param), persists via `createAsset` |
| Provider registry   | `src/generation/providers/registry.ts`            | ✅ Built | failover, circuit breaker                                      |
| Image-edit provider | `src/image-edit/providers/comfyui-provider.ts`    | ⚠️ Bug  | `execute` emits dangling asset links (never stores image)       |
| Image-edit routes   | `src/image-edit/routes.ts`                         | ⚠️ Unmounted | handlers defined, NOT registered in server/Elysia app        |
| Builtin TS templates| `src/image-edit/templates/builtin/*`              | ✅ Built | txt2img/img2img/inpaint/upscale/controlnet + LoRA helpers      |
| Node discovery      | `src/image-edit/providers/comfyui-provider.ts`    | ✅ Built | `/object_info` → `getInstalledNodes`/`listCapabilities`         |
| Workflow gallery UI | `src/views/comfyui-gallery.html`                  | ❌       | Not started                                                    |
| `/ws` progress       | —                                                 | ❌       | Polling only; `onProgress` callbacks exist but no WS channel    |
| GGUF model loading  | —                                                 | ❌       | Pending                                                         |

> Note: the epic's original "Files (proposed)" pointed at `src/plugins/comfyui/`.
> That directory does not exist — the work landed in `src/image-edit/` and
> `src/generation/image-engine/comfyui.ts` instead. This epic is reconciled to
> the real layout.

## Design

### Workflow Template

```typescript
interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: "txt2img" | "img2img" | "controlnet" | "inpaint" | "upscale" | "style" | "video" | "audio";
  required_nodes: string[]; // ComfyUI node class_types
  parameters: TemplateParameter[]; // user-facing params
  build: (params: Record<string, unknown>,) => ComfyUIWorkflow;
}

interface TemplateParameter {
  name: string;
  type: "string" | "number" | "boolean" | "select" | "image" | "lora";
  label: string;
  default: unknown;
  min?: number;
  max?: number;
  options?: { label: string; value: unknown }[];
}
```

### Plugin Registration

```typescript
// src/plugins/comfyui/plugin.ts  (PROPOSED — directory not yet created)
export default {
  id: "comfyui",
  name: "ComfyUI Integration",
  version: "1.0.0",
  capabilities: ["image-generation", "workflow-execution",],
  config: {
    baseUrl: { type: "string", default: "http://localhost:8188", },
    pollIntervalMs: { type: "number", default: 500, },
    autoDiscoverNodes: { type: "boolean", default: true, },
  },
};
```

### Executable Template Flow

```
User selects template → fills params → frontend sends POST /api/comfyui/run
→ backend builds workflow JSON from template + params
→ submits via ComfyUI provider → polls → returns generated images
```

> Reality check: the route today is `POST /api/image-edit/run` (Path B) and
> `POST …/image-gen` with a `workflow` name (Path A). The `/api/comfyui/run`
> path in the original design was never created.

## Templates Applicable for Our Usecases

New usecases are added **in place** as workflow templates — no API-call change.

| Usecase            | Recommended template form                          | Notes / source                         |
| ------------------ | -------------------------------------------------- | -------------------------------------- |
| Emotion avatars    | Path A — `workflow` param via `generateImages`     | Already wired (`emotion-avatar-service`) |
| txt2img / img2img  | Both: `configs/workflows/*.json` + TS template     | Already exist                          |
| inpaint / upscale  | TS template (Path B) + JSON (Path A)               | Already exist                          |
| controlnet         | TS template (Path B)                               | Already exist                          |
| **FLUX.1 Kontext** | **New** `configs/workflows/flux-kontext.json`      | Highest potential (epic test notes); dual-image context-edit graph; in-place |
| **Qwen Image Edit**| **New** `configs/workflows/qwen-edit.json`         | Works but slow/heavy (>20GB)           |
| **Krea 2 Edit**    | **New** `configs/workflows/krea2-edit.json`        | Currently fails — retest before template |
| LoRA application   | `buildLoraNodes` / `injectComfyUILora`             | Coeff 0.3–0.7 (epic test notes)       |

Parameterization needs no code: `{{var}}` substitution + `nodeOverrides`
(`src/generation/workflow-substitutor`) cover prompt/seed/dimensions and
node-targeted edits.

## Tasks

### Phase 0: Unblock Path B (must-fix before any template work on Path B)

- [ ] **Mount** `src/image-edit/routes.ts` handlers in the server/Elysia app
      (currently zero mounts).
- [ ] **Fix** `ComfyUIEditProvider.execute` to download images
      (`client.downloadImage`) and persist via `createAsset`/`linkAsset`
      (mirror Path A) instead of emitting dangling `/api/assets/{uid}/raw` links.
- [ ] Add optional `client_id` to `ComfyUIClient.submitWorkflow` body
      (prereq for `/ws` progress + multi-client scoping).

### Phase 1: Core Template System (MVP)

- [x] Workflow template interface + registry (`src/image-edit/template-registry.ts`)
- [x] Template parameter schema + validation
- [x] Builtin templates: txt2img, img2img, inpaint, upscale, controlnet
- [x] LoRA builders (`buildLoraNodes`, `parseLoraString`)
- [x] Node discovery via `/object_info`
- [ ] `POST /api/image-edit/run` route mounted + error handling (mounting missing)
- [ ] Unit tests for template builder + workflow construction

### Phase 2: Text-Guided Editing Templates (High Priority) — in-place JSON

- [ ] FLUX.1 Kontext editing template (`configs/workflows/flux-kontext.json`, untested → test)
- [ ] Qwen Image Edit template (`configs/workflows/qwen-edit.json`)
- [ ] LoRA selection + strength parameter (already supported via `buildLoraNodes`)

### Phase 3: Supporting Templates (Medium Priority)

- [x] txt2img template (basic text-to-image)
- [x] img2img template (style transfer, denoising)
- [x] Upscale template (ESRGAN/RealESRGAN)
- [ ] Krea 2 template (after retest root-causes the current failure)

### Phase 4: Discovery & UI (Lower Priority)

- [x] ComfyUI node discovery via `/object_info`
- [x] Auto-filter templates by installed nodes
- [ ] `GET /api/image-edit/nodes` route **mounted**
- [ ] Workflow gallery UI (`src/views/comfyui-gallery.html`)
- [ ] Template editor UI (parameter form generation)
- [ ] **WebSocket** progress streaming (`/ws`) using `client_id`
- [ ] Workflow history + output gallery

### Phase 5: Low Priority (Manual Tools Sufficient)

- [ ] ControlNet templates (users prefer Krita)
- [ ] Inpainting templates (users prefer Krita/manual tools)
- [ ] IP-Adapter templates (older SD/SDXL models)

## Dependencies

- Existing: `src/generation/providers/comfyui.ts` (HTTP client)
- Existing: `src/generation/image-engine/comfyui.ts` (production path)
- Existing: `src/generation/workflow-loader/` + `workflow-substitutor`
- Existing: `src/image-edit/` (template system, provider, routes)
- Existing: `configs/workflows/*.json` (on-disk templates)
- New: ComfyUI server running with desired models/nodes

## Testing Strategy

| Test        | Coverage                                              | Files                                        |
| ----------- | ----------------------------------------------------- | -------------------------------------------- |
| Unit        | Template builder produces valid workflow JSON         | `src/image-edit/templates/builtin/*.test.ts` |
| Unit        | Parameter validation + defaults                       | `src/image-edit/template-registry.test.ts`   |
| Unit        | `ComfyUIClient.submitWorkflow` body incl. `client_id` | `src/generation/providers/comfyui.test.ts`   |
| Integration | Submit workflow → poll → retrieve + **persist asset** | `tests/integration/comfyui.test.ts`          |
| E2E         | Full flow: select template → run → view result        | `tests/e2e/flows/comfyui.test.ts`            |

## Files (actual vs proposed)

- `src/generation/providers/comfyui.ts` — HTTP client (add `client_id`, `/ws`)
- `src/generation/image-engine/comfyui.ts` — production generation path
- `src/generation/workflow-loader/` — on-disk workflow discovery + substitution
- `src/image-edit/` — template registry, providers, routes (mount + fix asset persist)
- `src/image-edit/templates/builtin/` — TS workflow templates
- `configs/workflows/*.json` — on-disk ComfyUI workflow templates (add flux-kontext, qwen-edit, krea2-edit)
- `src/plugins/comfyui/plugin.ts` — PROPOSED plugin registration (directory not yet created)
- `src/views/comfyui-gallery.html` — workflow gallery UI (not started)

## Open Questions

1. **Template storage:** JSON files on disk (`configs/workflows/`) vs DB. JSON wins for community sharing; already chosen for Path A.
2. **Workflow versioning:** How to handle template updates when ComfyUI nodes change?
3. **Sandboxing:** Should ComfyUI workflows run in a sandboxed context?
4. **Pricing:** Should workflow runs be rate-limited or metered?
5. **FLUX.1 Kontext testing:** Need to test in ComfyUI with GGUF weights — highest potential model.
6. **Krea 2 retest:** Why does it fail in ComfyUI? Machine-specific or model issue?
7. **Klein models:** Are strange results from quantization, prompt format, or setup?
8. **Qwen layer rotation:** Can OOM avoidance be automated in the ComfyUI workflow?
9. **Plugin dir:** Original epic proposed `src/plugins/comfyui/`; work landed in `src/image-edit/` + `src/generation/image-engine/`. Reconcile — create the plugin shim or retire the proposal?

## Linked Tasks

- TASK-comfyui-node-discovery.md
- TASK-comfyui-template-registry.md
