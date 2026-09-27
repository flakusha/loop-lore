<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI first-class: mount image-edit routes + verify asset persistence

**Status:** Not Started
**Priority:** high
**Effort:** Small-Medium (route mount + authz parity + persistence verify)
**Summary:** Mount image-edit routes for the ComfyUI backend with `handleRun` authz at `handleImageGeneration` parity; fix stale `/api/*` doc comments to `/api/v1/*`; execute-then-fetch roundtrip pins the anti-dangling invariant (asset row exists before any response references it).
**Context:** First-Class Program Phase 0 (`epic-comfyui-plugin.md`). Route work landed for other backends in `src/image-edit/`; ComfyUI parity keeps authz and persistence semantics identical across backends.

**Acceptance Criteria:**
- [ ] ComfyUI image-edit routes mounted with the same authz checks as `handleImageGeneration` (no weaker path).
- [ ] Doc comments referencing stale `/api/*` paths updated to `/api/v1/*`.
- [ ] Execute-then-fetch roundtrip verified: response only references persisted asset ids (test asserts no dangling references).
- [ ] Route tests cover authz rejection and persistence roundtrip.
- [ ] `bun run check` green.

**Epic:** epic-comfyui-plugin
**Tags:** comfyui, image-edit, routes, authz, asset-persistence
**Related:** src/image-edit/, epic-comfyui-plugin.md Phase 0


git issue: a6afe33
