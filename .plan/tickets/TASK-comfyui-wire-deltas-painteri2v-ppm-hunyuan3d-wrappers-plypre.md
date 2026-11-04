<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ComfyUI WIRE deltas: PainterI2V, ppm, Hunyuan3D wrappers, PlyPreview, ACE-Step nodes

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

WIRE candidates from .tmp/research/external-brains/02-repositories.md (deltas vs full-cycle-watchlist, 2026-11-03). princepainter/ComfyUI-PainterI2V (Wan2.2 I2V slow-motion fix, take with Wan2.2 provider); pamparamm/ComfyUI-ppm (Attention-Couple + NegPiP for MOSS Image, take with moss-base import); visualbruno/ComfyUI-Hunyuan3d-2-1 + Yuan-ManX/ComfyUI-Hunyuan3D-2.1 (PBR path wrappers, take on Hunyuan3D eval trigger); XuanYu-github/comfyui-PlyPreview (PLY preview + gsplat viewer, fills splat-preview gap); billwuhao/ComfyUI_ACE-Step (music lane nodes). Each WIREs only on its trigger — no bulk import. Model-line updates tracked alongside: FLUX.3-Klein supersedes 2-klein; Qwen-3.0 closed so 2.1 is the pin.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
