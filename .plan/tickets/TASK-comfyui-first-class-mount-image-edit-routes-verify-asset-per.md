<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI first-class: mount image-edit routes + verify asset persistence

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-comfyui-plugin
**Tags:** comfyui, routes

**Summary:** Mount `/api/image-edit/*` in the Elysia app and pin the execute-then-fetch persistence invariant with a roundtrip regression test.

**Context:**

Two surfaces, two states (verified this session). Path A (production, `src/generation/image-engine/comfyui.ts` → `runWorkflow` → `downloadImage` → `createAsset`/`linkAsset`) persists correctly — this is the live emotion-avatar path. Path B (`src/image-edit/`): routes defined in `src/image-edit/routes.ts` (`/api/image-edit/run|templates|nodes|capabilities|health`) but zero imports/mounts outside `src/image-edit/` — dead surface. Good news on the epic's 'dangling links' gap: `ComfyUIEditProvider.execute` (src/image-edit/providers/comfyui-provider.ts:153-197) DOES download + `createAsset` + `linkAsset` (chat/message) and returns real `/api/assets/{id}/raw` URLs — the epic text is stale, this task re-verifies and pins it.

## Implementation

1. Mount `src/image-edit/routes.ts` in the Elysia app next to sibling route mounts; authz consistent with `/api/generation/*` (same caller shape — verify against image-gen-route guards, don't invent new policy).
2. Regression test: `execute()` → `GET /api/assets/{id}/raw` returns the bytes (pins the anti-dangling invariant; closes the stale epic gap entry).
3. Route smoke tests: `templates` lists builtinRegistry, `nodes` proxies `/object_info` discovery, `health` reflects backend reachability.
4. Update `epic-comfyui-plugin.md` status block: strike the dangling-links gap, record routes mounted.

**Acceptance Criteria:**

- [ ] `/api/image-edit/*` reachable with sibling-consistent authz
- [ ] execute-then-fetch roundtrip test green (no dangling links)
- [ ] Route smoke tests green
- [ ] Epic status block updated
- [ ] Documentation updated
