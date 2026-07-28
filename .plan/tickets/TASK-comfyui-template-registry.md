# TASK: ComfyUI Workflow Template Registry

**Priority:** High
**Status:** ⬜ Not Started
**Epic:** epic-comfyui-plugin
**Depends on:** existing ComfyUI client (`src/generation/providers/comfyui.ts`)

## Description

Create a workflow template system that parameterizes common ComfyUI operations.
Templates accept simple inputs (prompt, image, settings) and generate full
ComfyUI workflow JSON.

ComfyUI is first-class citizen. Finalized workflow files are the API contract.

## Practical Testing Notes (2026-07-28)

- FLUX.1 Kontext: untested but highest potential, 4-6GB VRAM with --clip-on-cpu
- Qwen Image Edit: works but >20GB real usage, needs layer rotation
- LoRA: works, coefficient 0.3-0.7 typical
- ControlNet/inpainting: low priority, users prefer Krita

## Acceptance Criteria

### Phase 1: Core Template System (MVP)
- [ ] `WorkflowTemplate` interface defined with `build()` function
- [ ] Template registry supports add/remove/list/get operations
- [ ] Parameter schema with type validation + defaults
- [ ] Templates stored as JSON files in `src/plugins/comfyui/templates/`
- [ ] Unit tests for template builder functions
- [ ] Unit tests for parameter validation

### Phase 2: Text-Guided Editing (High Priority)
- [ ] FLUX.1 Kontext editing template
- [ ] Qwen Image Edit template (fallback)
- [ ] LoRA application template (LoraLoader node, coeff 0.3-0.7)

### Phase 3: Supporting Templates (Medium Priority)
- [ ] txt2img template
- [ ] img2img template
- [ ] Upscale template (ESRGAN)

### Phase 4: Low Priority
- [ ] ControlNet template (manual setup needed)
- [ ] Inpainting template (users prefer Krita)
- [ ] IP-Adapter template (mostly for older models)

## Technical Notes

- Template JSON files should be importable via Bun's JSON import
- Each template file exports a `build(params)` function
- Registry loads templates at startup, validates structure
- Parameters use JSON Schema subset for validation
- LoRA strength parameter: 0.1-1.0, typical 0.3-0.7
- FLUX.1 Kontext: --cfg-scale 1.0 recommended
