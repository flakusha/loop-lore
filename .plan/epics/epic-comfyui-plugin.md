<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: ComfyUI Plugin & Workflow Templates

**Status:** 🟡 Partial — unified ComfyUI + sd-server image editing, node discovery (comfyui/http/sdserver), workflow templates + LoRA shipped; GGUF model loading pending
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** comfyui, plugin, workflow, image-generation, templates, api
**ComfyUI Status:** First-class citizen

## Overview

ComfyUI is the primary integration target for image generation and editing.
Finalized workflow files (JSON) are the API contract for endpoint calls.
This epic extends the existing ComfyUI client (`src/generation/providers/comfyui.ts`)
into a full plugin system with executable workflow templates.

Currently the client can submit raw workflow JSON. This epic adds:

1. **Workflow template registry** — pre-built, parameterized templates for editing
   (text-guided editing, LoRA application, upscaling)
2. **Plugin architecture** — ComfyUI as a first-class plugin with install/config/UI
3. **Executable templates** — templates that accept simple parameters and generate
   full ComfyUI workflow JSON
4. **Node discovery** — auto-detect installed ComfyUI nodes and filter templates
5. **Workflow gallery** — UI for browsing/previewing/managing workflow templates

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

| Area                | File                                   | State    | Notes                                      |
| ------------------- | -------------------------------------- | -------- | ------------------------------------------ |
| ComfyUI HTTP client | `src/generation/providers/comfyui.ts`  | ✅ Built | submit/poll/WS/download (231 lines)        |
| Image gen route     | `src/generation/image-gen-route.ts`    | ✅ Built | sd-server integration (290 lines)          |
| Provider registry   | `src/generation/providers/registry.ts` | ✅ Built | failover, circuit breaker                  |
| ComfyUI plugin      | —                                      | ❌       | No plugin registration, no template system |
| Workflow templates  | —                                      | ❌       | No pre-built workflows                     |
| Node discovery      | —                                      | ❌       | No `/object_info` consumption              |

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
  type: "string" | "number" | "boolean" | "select" | "image";
  label: string;
  default: unknown;
  min?: number;
  max?: number;
  options?: { label: string; value: unknown }[];
}
```

### Plugin Registration

```typescript
// src/plugins/comfyui/plugin.ts
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

## Tasks

### Phase 1: Core Template System (MVP)

- [ ] Workflow template interface + registry (`src/plugins/comfyui/templates.ts`)
- [ ] Template parameter schema + validation
- [ ] Plugin registration + config schema
- [ ] `POST /api/comfyui/run` route (template-based execution)
- [ ] `GET /api/comfyui/templates` route (list available templates)
- [ ] Error handling: missing nodes, timeout, partial failure
- [ ] Unit tests for template builder + workflow construction

### Phase 2: Text-Guided Editing Templates (High Priority)

- [ ] FLUX.1 Kontext editing template (highest potential, untested)
- [ ] Qwen Image Edit template (tested, works but slow/heavy)
- [ ] LoRA application in workflows (LoraLoader node, coeff 0.3-0.7)
- [ ] Template parameter for LoRA selection + strength

### Phase 3: Supporting Templates (Medium Priority)

- [ ] txt2img template (basic text-to-image)
- [ ] img2img template (style transfer, denoising)
- [ ] Upscale template (ESRGAN/RealESRGAN)

### Phase 4: Discovery & UI (Lower Priority)

- [ ] ComfyUI node discovery via `/object_info` endpoint
- [ ] Auto-filter templates by installed nodes
- [ ] `GET /api/comfyui/nodes` route (discover installed nodes)
- [ ] Workflow gallery UI (`src/views/comfyui-gallery.html`)
- [ ] Template editor UI (parameter form generation)
- [ ] WebSocket progress streaming to frontend
- [ ] Workflow history + output gallery

### Phase 5: Low Priority (Manual Tools Sufficient)

- [ ] ControlNet templates (manual setup needed, users prefer Krita)
- [ ] Inpainting templates (users prefer Krita/manual tools)
- [ ] IP-Adapter templates (mostly for older SD/SDXL models)

## Dependencies

- Existing: `src/generation/providers/comfyui.ts` (HTTP client)
- Existing: `src/generation/image-gen-route.ts` (image gen pipeline)
- Existing: `src/plugins/` (plugin skeleton)
- New: ComfyUI server running with desired models/nodes

## Testing Strategy

| Test        | Coverage                                       | Files                                   |
| ----------- | ---------------------------------------------- | --------------------------------------- |
| Unit        | Template builder produces valid workflow JSON  | `src/plugins/comfyui/templates.test.ts` |
| Unit        | Parameter validation + defaults                | `src/plugins/comfyui/params.test.ts`    |
| Integration | Submit workflow → poll → retrieve image        | `tests/integration/comfyui.test.ts`     |
| E2E         | Full flow: select template → run → view result | `tests/e2e/flows/comfyui.test.ts`       |

## Files (proposed)

- `src/plugins/comfyui/` — plugin directory
- `src/plugins/comfyui/plugin.ts` — plugin registration
- `src/plugins/comfyui/templates.ts` — template registry + builders
- `src/plugins/comfyui/templates/*.json` — built-in workflow templates
- `src/plugins/comfyui/discovery.ts` — node discovery
- `src/routes/comfyui.ts` — API routes
- `src/views/comfyui-gallery.html` — workflow gallery UI

## Open Questions

1. **Template storage:** JSON files on disk vs DB table? JSON files are simpler for community sharing.
2. **Workflow versioning:** How to handle template updates when ComfyUI nodes change?
3. **Sandboxing:** Should ComfyUI workflows run in a sandboxed context?
4. **Pricing:** Should workflow runs be rate-limited or metered?
5. **FLUX.1 Kontext testing:** Need to test in ComfyUI with GGUF weights — highest potential model
6. **Krea 2 retest:** Why does it fail in ComfyUI? Machine-specific or model issue?
7. **Klein models:** Are strange results from quantization, prompt format, or setup?
8. **Qwen layer rotation:** Can OOM avoidance be automated in the ComfyUI workflow?

## Linked Tasks

- TASK-comfyui-node-discovery.md
- TASK-comfyui-template-registry.md
