<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ComfyUI model discovery and configurable model names

**Status:** In Progress
**Priority:** high
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, comfyui, models
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**
Surface ComfyUI model files by role for the local H3/VSS fragment workflow: clip (`.safetensors`, `.gguf`), diffusion (`.safetensors` in practice), and VAE (unless a no-VAE model is selected). Names must be discoverable from the ComfyUI integration model folders AND explicitly configurable by the operator, with an example config under `configs/` (new `config.comfyui.example.toml` or an extension of `config.generation.example.toml`). Config wins; discovered names are the fallback. Reject role/extension mismatches at config load; reuse existing ComfyUI client/config seams, no new dependency.

**Context:**
Operator addition to the 2026-11-19 minimax-h3 workflow work in `tree/full-cycle-director`. `VideoProviderConfig` currently has no model-name fields (`packages/core/src/config/schema/providers.ts:128-153`), and `configs/config.generation.example.toml:18` only documents video provider endpoints. Model names need a discoverable surface (ComfyUI model folders / object info) plus explicit overrides; no live ComfyUI job was run. Git issue `dcb6c5c`.

**Acceptance Criteria:**

- [ ] Discover model names per role from ComfyUI model folders with role-specific extension filters: clip `.safetensors`/`.gguf`, diffusion `.safetensors`, VAE for VAE models
- [ ] A no-VAE model selection skips VAE resolution without an error
- [ ] Explicit per-role model overrides are configurable in the example config and take precedence over discovered names
- [ ] Role/extension mismatch is rejected at config load with a clear operator-facing error
- [ ] Regression tests cover discovery parsing, extension filtering, config precedence, and the no-VAE path
- [ ] Example config documents the override fields
