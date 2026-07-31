# TASK: LoRA Discovery & Application

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-lora-discovery-application

## Summary

LoRA discovery (auto-detect available models from sd.cpp/ComfyUI) and application (inject into workflows with configurable strength). Enables character-specific visual consistency across generations.

## Practical Testing Notes (2026-07-28)

- **sd.cpp**: LoRA works via prompt injection `[lora:name:strength]`
- **ComfyUI**: LoRA works via LoraLoader node, coeff 0.3-0.7 typical
- **Both backends support LoRA** — implementation should too

## Acceptance Criteria

### Phase 1: Core LoRA System (MVP)

- [ ] `LoRAConfig` interface defined
- [ ] LoRA discovery for sd.cpp (`GET /sd-api/v1/models` → filter)
- [ ] LoRA discovery for ComfyUI (`GET /object_info` → LoraLoader models)
- [ ] `POST /api/lora/discover` route
- [ ] `GET /api/lora/list` route (cached)
- [ ] Unit tests for discovery + validation

### Phase 2: LoRA Application

- [ ] sd.cpp prompt injection (`[lora:name:strength]`)
- [ ] ComfyUI LoraLoader node injection
- [ ] LoRA strength slider in UI (0.1-1.0)
- [ ] Integration with image gen pipeline

### Phase 3: LoRA Management UI

- [ ] LoRA selector dropdown
- [ ] Per-character LoRA binding
- [ ] Strength presets (subtle/normal/strong)

## Technical Notes

### sd.cpp LoRA Injection

```typescript
// Simple prompt prefix
const loraPrefix = `[lora:${config.name}:${config.strength}]`;
```

### ComfyUI LoraLoader Node

```json
{
  "class_type": "LoraLoader",
  "inputs": {
    "lora_name": "model.safetensors",
    "strength_model": 0.7,
    "strength_clip": 0.7
  }
}
```

### Discovery Endpoints

- sd.cpp: `GET /sd-api/v1/models` → filter `.safetensors`/`.pt`
- ComfyUI: `GET /object_info` → extract from LoraLoader input config

## Related

- `epic-lora-discovery-application.md` — full epic spec
- `epic-comfyui-plugin.md` — ComfyUI workflow templates (Phase 2 includes LoRA)
- `epic-assistant-generation-extensions.md` — `/image` command (Phase 2 includes LoRA)
