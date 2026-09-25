<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI first-class: llama-swap recipe standalone-vs-proxy matrix + docs

**Status:** open
**Priority:** medium
**Effort:** Small (recipe matrix + docs promotion)
**Summary:** llama-swap recipe mode matrix covering standalone vs proxy deployments; promote `image-generation.md` ComfyUI status from 'Future' to first-class with the supported recipe matrix.
**Context:** First-Class Program docs step (`epic-comfyui-plugin.md`). llama-swap `comfyui_auto` passthrough landed; the recipe matrix documents which launch modes (standalone spawner vs llama-swap proxy) are supported and their baseUrl/queue semantics.

**Acceptance Criteria:**
- [ ] Recipe matrix in docs: standalone vs llama-swap proxy × auto-start × queue semantics, each cell marked supported/planned.
- [ ] `image-generation.md` no longer lists ComfyUI under 'Future'; first-class status + recipe pointer.
- [ ] Docs accurate to config schema (no invented flags).
- [ ] `bun run md:lint` green.

**Epic:** epic-comfyui-plugin
**Tags:** comfyui, llama-swap, docs, recipe-matrix
**Related:** TASK-comfyui-first-class-standalone-auto-start-config-lifecycle, TASK-comfyui-first-class-image-generation-queue-honors-comfyui-ba


git issue: 33122ec
