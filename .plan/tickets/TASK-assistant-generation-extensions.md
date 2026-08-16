<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: EPIC: Assistant Generation Extensions (Image Gen, Intent, Scenario Source)

**Status:** 🟡 In Progress — `/image` command dispatch done, generation adapter pending (2026-08-01)
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

## Current State (2026-08-01 review)

- ✅ `/image` command handler (`src/assistant/commands/image.ts`) — returns `action: "generate-image"` + prompt for frontend dispatch to `POST /api/generation/image`; avoids double-exec
- ✅ `/improve` basic impl; `/quest`, `/video`, `/sfx`, `/music`, `/caption` handlers registered (stub-level actions)
- ❌ Backend generation adapter (ComfyUI/sd.cpp routing), entity-to-asset mapping, `/image edit/style/upscale` subcommands — pending
- Epic status table is stale (marks `/image` "❌ Not started" — file exists since earlier commit)

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

## Related

- **Feature spec:** `FEAT-assistant-generation-extensions.md`
