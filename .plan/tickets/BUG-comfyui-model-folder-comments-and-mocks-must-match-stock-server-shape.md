<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: ComfyUI model-folder comments and mocks must match stock server shape

**Status:** Not Started
**Priority:** Medium
**Effort:** Small
**Epic:** epic-comfyui-first-class-citizen
**Caveats:** partial failure, stale state, observability

**Context:**

Discovery docs and mocks encode folder aliases absent from stock ComfyUI; correct the documented shape.

**Summary:**

Discovery comments and tests encode folder aliases that do not exist on stock ComfyUI. The discovery filter happens to avoid the resulting failure, but the documented shape is wrong.

**Evidence:**

- `https://docs.comfy.org/development/comfyui-server/comms_routes`
- ComfyUI v0.46.0 release notes.
- Research-cited discovery aliases, comments, and mocks in `.tmp/research/tomorrow-followups-2026-11-21.md`.

**Scope:**

- Correct `clip`/`unet` wording to the live registry keys.
- Document that GGUF-specific aliases require ComfyUI-GGUF.
- Correct the test mock so it uses the stock `/models` shape.
- Do not change discovery filtering unless a live-server test exposes a separate defect.

**Acceptance Criteria:**


git issue: 13d3d27

- [ ] Comments name the live stock folder keys.
- [ ] GGUF requirements are explicit.
- [ ] Mocks use a realistic stock `/models` response.
- [ ] Discovery/model tests pass.
