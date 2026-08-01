# EPIC: LoRA Discovery & Application

**Status:** 🟡 Phase 1 Complete, Phase 2 Partial
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

### Phase 1: Core LoRA System (MVP) ✅ COMPLETE (2026-08-01)

- [x] `LoRAConfig` interface + validation (`types.ts`, `validation.ts`)
- [x] LoRA discovery for sd.cpp backend (`discovery-sdserver.ts`)
- [x] LoRA discovery for ComfyUI backend (`discovery-comfyui.ts`)
- [x] Unified discovery with caching (`discovery.ts` — Map-based, 5min TTL, force-refresh)
- [x] `POST /api/lora/discover` route (single + all backends)
- [x] `GET /api/lora/list` route (cached, backend/search filter)
- [x] `GET /api/lora/status` + `POST /api/lora/clear` cache management
- [x] `POST /api/lora/validate` config validation endpoint
- [x] Unit tests: 39+ tests covering discovery, cache, validation, injection helpers

### Phase 2: LoRA Application ⚠️ PARTIAL

- [x] sd.cpp LoRA injection helpers (`buildSdCppLoraPrefix`/`injectSdCppLora`)
- [x] ComfyUI LoraLoader node injection (`buildComfyUILoraNode`/`injectComfyUILora`)
- [ ] Wire LoRA into image gen pipeline — TODO-gated hooks in `image-gen-route.ts` (imports/body/injection all commented out)
- [ ] LoRA strength parameter in template UI (slider 0.1-1.0)
- [ ] Integration with emotion avatar fallback
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

## Files (actual, on dev)

### New Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/generation/lora/types.ts` | 94 | Interfaces (`LoRAConfig`, `LoRAModel`, `LoRADiscoveryResult`, `LoRAApplicationContext`) + constants |
| `src/generation/lora/discovery.ts` | 175 | Unified discovery dispatch + Map-based cache (5min TTL) + `getCachedLoras`/`getCacheStatus`/`clearDiscoveryCache` |
| `src/generation/lora/discovery-sdserver.ts` | 181 | sd.cpp: `discoverSdCppLoras` (GET /sd-api/v1/models → filter) + `buildSdCppLoraPrefix`/`injectSdCppLora` |
| `src/generation/lora/discovery-comfyui.ts` | 260 | ComfyUI: `discoverComfyUILoras` (GET /object_info → LoraLoader) + `buildComfyUILoraNode`/`injectComfyUILora` |
| `src/generation/lora/validation.ts` | 163 | `validateLoRAConfig`, `validateLoRAModel`, `isLoRAFilename`, `extractLoRAName`, `clampStrength`, `isTypicalStrength` |
| `src/generation/lora/index.ts` | 49 | Public API re-exports from all sub-modules |
| `src/generation/lora/routes.ts` | 377 | Elysia plugin: discover, list, status, clear, validate — TODO-gated, not wired |
| `src/generation/lora/discovery.test.ts` | 336 | Mock-fetch tests for both backends, cache, force-refresh |
| `src/generation/lora/lora.test.ts` | 221 | Validation tests: config, model, strength boundary, edge cases |

### Modified Files

| File | Change |
|------|--------|
| `src/generation/image-gen-route.ts` | LoRA hooks added as TODO-gated comments (imports, body field, sdcpp injection, comfyui injection) |
| `src/elysia-app.ts` | `loraRoutes` import + registration commented out with TODO |

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

1. **LoRA metadata**: Can we extract trigger words from LoRA files? — *Partially: `triggerWords` and `recommendedStrength` fields in `LoRAModel` interface, but discovery doesn't extract them yet from file metadata*
2. **Multi-LoRA stacking**: How to handle multiple LoRAs? — *Phase 4*
3. **LoRA installation**: Should we support downloading LoRAs from CivitAI? — *Phase 4*
4. **Character binding**: Auto-apply character LoRA when character is selected? — *Phase 3*
5. **Performance**: Should LoRA discovery be cached? — *Yes: Map-based cache, 5min TTL, forceRefresh option*
6. **URL resolution**: FIXED — was `pickSdProvider()` returning one provider for both; now finds by `apiFamily` from `sd[]` array (`"comfyui"` + `"sdcpp"` separately)

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
