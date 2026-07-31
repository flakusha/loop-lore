# EPIC: LoRA Discovery & Application

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** lora, stable-diffusion, comfyui, sd-server, style-transfer, character-style

## Overview

LoRA (Low-Rank Adaptation) enables character-specific and style-specific visual consistency across generations. This epic implements LoRA discovery (auto-detect available models) and application (inject into workflows) for both ComfyUI and sd.cpp backends.

**Key insight from testing (2026-07-28):** LoRA works on both backends:
- **sd.cpp**: Prompt injection (simpler, works now)
- **ComfyUI**: LoraLoader node (more control, coefficient 0.3-0.7 typical)

## Business Value

- **Character visual identity** — same LoRA = consistent character appearance across sessions
- **Style consistency** — apply artistic style to all generations
- **User control** — let users choose LoRA + strength for fine-tuning output

## Architecture

### LoRA Config Schema

```typescript
interface LoRAConfig {
  name: string;           // model filename without extension
  strength: number;       // 0.1-1.0, typical 0.3-0.7
  backend: "comfyui" | "sd-server";
}

// In ImageGenRequest (extend existing)
interface ImageGenRequest {
  // ... existing fields
  lora?: LoRAConfig;
}
```

### Backend-Specific Application

| Backend | LoRA Application | Notes |
|---------|-----------------|-------|
| sd.cpp | Prompt injection `[lora:name:strength]` | Simpler, works now |
| ComfyUI | LoraLoader node in workflow | More control, requires node |

### Discovery Flow

```
1. GET /api/lora/discover?backend=comfyui|sd-server
2. Backend-specific discovery:
   - ComfyUI: GET /object_info → find LoraLoader node → extract model list
   - sd.cpp: GET /sd-api/v1/models → filter .safetensors/.pt files
3. Return: Array<{ name: string, backend: string, path: string }>
```

## Tasks

### Phase 1: Core LoRA System (MVP)

- [ ] `LoRAConfig` interface + validation
- [ ] LoRA discovery for sd.cpp backend (`GET /sd-api/v1/models` → filter)
- [ ] LoRA discovery for ComfyUI backend (`GET /object_info` → LoraLoader models)
- [ ] `POST /api/lora/discover` route (unified discovery)
- [ ] `GET /api/lora/list` route (cached model list)
- [ ] Unit tests for LoRA discovery + validation

### Phase 2: LoRA Application

- [ ] sd.cpp LoRA injection (prompt prefix: `[lora:name:strength]`)
- [ ] ComfyUI LoraLoader node injection into workflow templates
- [ ] LoRA strength parameter in template UI (slider 0.1-1.0)
- [ ] Integration with emotion avatar fallback (Phase 1 already done)
- [ ] Integration with `/image` command (when implemented)

### Phase 3: LoRA Management UI

- [ ] LoRA selector component (dropdown with search)
- [ ] LoRA preview/thumbnail display (if available)
- [ ] Per-character LoRA binding (character → LoRA association)
- [ ] LoRA strength presets (subtle: 0.3, normal: 0.5, strong: 0.7)

### Phase 4: Advanced Features

- [ ] Multi-LoRA support (stack multiple LoRAs)
- [ ] LoRA metadata extraction (trigger words, recommended strength)
- [ ] LoRA download/install from CivitAI/HuggingFace
- [ ] LoRA caching (avoid re-downloading)

## Files (proposed)

### New Files

- `src/generation/lora/types.ts` — LoRAConfig interface
- `src/generation/lora/discovery.ts` — backend-specific discovery
- `src/generation/lora/injector.ts` — LoRA injection into prompts/workflows
- `src/generation/lora/routes.ts` — API routes
- `src/generation/lora/registry.ts` — cached model list
- `src/generation/lora/lora.test.ts` — unit tests

### Modified Files

- `src/generation/providers/comfyui.ts` — LoraLoader node injection
- `src/generation/providers/registry.ts` — LoRA-aware provider selection
- `src/generation/image-gen-route.ts` — accept lora param
- `src/generation/types.ts` — extend ImageGenRequest

## Technical Notes

### sd.cpp LoRA (simpler path)

```typescript
// Prompt injection format
const loraPrefix = `[lora:${config.name}:${config.strength}]`;
const fullPrompt = `${loraPrefix} ${userPrompt}`;
```

### ComfyUI LoRA (LoraLoader node)

```json
{
  "node_id": "LoraLoader",
  "class_type": "LoraLoader",
  "inputs": {
    "lora_name": "character_name.safetensors",
    "strength_model": 0.7,
    "strength_clip": 0.7
  }
}
```

### Discovery Implementation

```typescript
// ComfyUI: extract from /object_info
async function discoverComfyUILoras(baseUrl: string): Promise<LoRAModel[]> {
  const info = await fetch(`${baseUrl}/object_info`);
  const loraLoader = info.LoraLoader;
  // Extract available models from input config
  return loraLoader.input.required.lora_name[0];
}

// sd.cpp: filter model list
async function discoverSdCppLoras(baseUrl: string): Promise<LoRAModel[]> {
  const models = await fetch(`${baseUrl}/sd-api/v1/models`);
  return models.data
    .filter(m => m.name.endsWith('.safetensors') || m.name.endsWith('.pt'))
    .map(m => ({ name: m.name, path: m.path }));
}
```

## Open Questions

1. **LoRA metadata**: Can we extract trigger words from LoRA files? (Some include metadata)
2. **Multi-LoRA stacking**: How to handle multiple LoRAs? (ComfyUI supports chain, sd.cpp limited)
3. **LoRA installation**: Should we support downloading LoRAs from CivitAI?
4. **Character binding**: Auto-apply character LoRA when character is selected?
5. **Performance**: Should LoRA discovery be cached? How often to refresh?

## Linked Tasks

- TASK-comfyui-template-registry.md (Phase 2: LoRA application)
- TASK-assistant-generation-extensions.md (Phase 2: LoRA in workflows)

## Testing Strategy

| Test | Coverage | Files |
|------|----------|-------|
| Unit | LoRA discovery parsing | `src/generation/lora/discovery.test.ts` |
| Unit | Prompt injection format | `src/generation/lora/injector.test.ts` |
| Unit | ComfyUI workflow modification | `src/generation/lora/comfyui.test.ts` |
| Integration | Discover LoRAs from running backend | `tests/integration/lora-discover.test.ts` |
| E2E | Generate image with LoRA applied | `tests/e2e/flows/lora-gen.test.ts` |
