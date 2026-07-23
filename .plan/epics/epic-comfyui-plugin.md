# EPIC: ComfyUI Plugin & Workflow Templates

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** comfyui, plugin, workflow, image-generation, templates, api

## Overview

Extend the existing ComfyUI client (`src/generation/providers/comfyui.ts`) into a
full plugin system with executable workflow templates. Currently the client can
submit raw workflow JSON — this epic adds:

1. **Workflow template registry** — pre-built, parameterized templates for common tasks
   (txt2img, img2img, ControlNet, inpainting, upscaling, style transfer)
2. **Plugin architecture** — ComfyUI as a first-class plugin with install/config/UI
3. **Executable templates** — templates that accept simple parameters and generate
   full ComfyUI workflow JSON
4. **Node discovery** — auto-detect installed ComfyUI nodes and filter templates
5. **Workflow gallery** — UI for browsing/previewing/managing workflow templates

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

- [ ] Workflow template interface + registry (`src/plugins/comfyui/templates.ts`)
- [ ] Built-in templates: txt2img, img2img, ControlNet, inpaint, upscale
- [ ] Template parameter schema + validation
- [ ] ComfyUI node discovery via `/object_info` endpoint
- [ ] Auto-filter templates by installed nodes
- [ ] Plugin registration + config schema
- [ ] `POST /api/comfyui/run` route (template-based execution)
- [ ] `GET /api/comfyui/templates` route (list available templates)
- [ ] `GET /api/comfyui/nodes` route (discover installed nodes)
- [ ] Workflow gallery UI (`src/views/comfyui-gallery.html`)
- [ ] Template editor UI (parameter form generation)
- [ ] WebSocket progress streaming to frontend
- [ ] Workflow history + output gallery
- [ ] Error handling: missing nodes, timeout, partial failure
- [ ] Unit tests for template builder + workflow construction

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

## Linked Tasks

- TASK-comfyui-node-discovery.md
- TASK-comfyui-template-registry.md
