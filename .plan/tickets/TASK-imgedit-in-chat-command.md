<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: imgedit in-chat command

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-assistant-generation-extensions
**Related:** `epic-comfyui-plugin.md`, `epic-reference-conditioned-generation.md` (img2img/edit workflow owners)
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add `/imgedit <template> [prompt]` as an in-chat assistant command reaching the
image-edit workflow registry, so img2img/inpaint/upscale workflows no longer
require leaving the chat. Source: assistant integration review 2026-10-23
(gap 3 / rec 3).

**Context:**

Image-edit is fixed-flow-only: `POST /api/v1/image-edit/run` and
`GET /image-edit/templates` (`src/image-edit/routes.ts:handleRun`,
`template-registry.ts`) are the only entrypoints. `/image`
(`commands/image.ts`) and `/caption` use the legacy generation path and never
reach `templateRegistry` [INFERENCE on /image internals — review matrix row 4].

**Approach**

- New `src/assistant/commands/imgedit.ts` calling the image-edit **service
  layer** (not the HTTP route), registered in `commands/index.ts`.
- Result surfaced via the existing `CommandResult.systemMessage` / action
  payload consumed by `chat-actions/` handlers.
- Group-chat support is free via `dispatchCommand` (`create.ts:139`).

**Acceptance Criteria:**

- [ ] `/imgedit <template> [prompt]` runs the template via the service layer
- [ ] Unknown template → clear error message, no partial job left behind
- [ ] Result/action payload renders in chat (single + group)
- [ ] Unit tests: command dispatch → service call, error paths (missing template,
      missing input image) covered
