# TASK: EPIC: Assistant Generation Extensions (Image Gen, Intent, Scenario Source)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-assistant-generation-extensions

## Summary

Implementation for image generation, intent detection, and scenario source.
ComfyUI is the primary backend. Finalized workflow files are the API contract.

## Practical Testing Notes (2026-07-28)

- FLUX.1 Kontext: untested but highest potential, 4-6GB VRAM
- Qwen Image Edit: works but >20GB real usage, needs layer rotation
- LoRA: works, coefficient 0.3-0.7 typical
- ControlNet/inpainting: low priority, users prefer Krita

## Linked Epics

- `epic-assistant-generation-extensions.md`
- `epic-comfyui-plugin.md` (workflow templates)

## Acceptance Criteria

### Phase 1: Core Image Generation (MVP)
- [ ] `/image <prompt>` command (txt2img via ComfyUI workflow)
- [ ] Image generation adapter (ComfyUI primary, sd.cpp secondary)
- [ ] Entity-to-asset mapping for characters/items/locations/worlds
- [ ] Backend routing logic (ComfyUI for complex, sd.cpp for simple)

### Phase 2: Text-Guided Editing (High Priority)
- [ ] `/image edit <prompt> --ref <file>` command (FLUX.1 Kontext)
- [ ] FLUX.1 Kontext ComfyUI workflow template
- [ ] Qwen Image Edit ComfyUI workflow template (fallback)
- [ ] LoRA application in workflows (LoraLoader node, coeff 0.3-0.7)

### Phase 3: Supporting Features (Medium Priority)
- [ ] `/image style <ref-image>` command (Krea 2 style reference or LoRA)
- [ ] `/image upscale <file>` command (ESRGAN template)
- [ ] Intent detection model + routing table

### Phase 4: Advanced Features (Lower Priority)
- [ ] `/image edit <prompt> --mask <file>` command (inpainting)
- [ ] Approved tool-execution allowlist + policy
- [ ] External API call policy gate
- [ ] Scenario source store + reuse in generation
