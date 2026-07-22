# TASK: ComfyUI Workflow Template Registry

**Priority:** High
**Status:** ✅ Done
**Epic:** epic-comfyui-plugin
**Depends on:** existing ComfyUI client (`src/generation/providers/comfyui.ts`)

## Description

Create a workflow template system that parameterizes common ComfyUI operations.
Templates accept simple inputs (prompt, image, settings) and generate full
ComfyUI workflow JSON.

## Acceptance Criteria

- [ ] `WorkflowTemplate` interface defined with `build()` function
- [ ] Template registry supports add/remove/list/get operations
- [ ] Built-in templates: txt2img, img2img, ControlNet, inpaint, upscale
- [ ] Parameter schema with type validation + defaults
- [ ] Templates stored as JSON files in `src/plugins/comfyui/templates/`
- [ ] Unit tests for template builder functions
- [ ] Unit tests for parameter validation

## Technical Notes

- Template JSON files should be importable via Bun's JSON import
- Each template file exports a `build(params)` function
- Registry loads templates at startup, validates structure
- Parameters use JSON Schema subset for validation
