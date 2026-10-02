<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: ComfyUI /ws Progress Streaming to Frontend

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Type:** Task
**Tags:** comfyui, websocket, progress, streaming, frontend
**Epic:** epic-comfyui-plugin

## Summary

Stream ComfyUI execution progress over `/ws` to the frontend, replacing
poll-only status with live progress events. Prereq: `client_id` on submit
(epic Phase 0) so executions scope to one WS client.

## Context

`epic-comfyui-plugin.md` status table (verified at HEAD): HTTP client
`src/generation/providers/comfyui.ts` implements `submitWorkflow`
(`POST /prompt`, body `{ prompt }` only — no `client_id`), `pollResult`
(`GET /history/{id}`), `waitForCompletion(band)` + `runWorkflow`
(submit → poll → download); `/ws` row is ❌ with `onProgress` callbacks
existing but no WS channel. Image-edit side consumes via
`ComfyUIEditProvider` (`src/image-edit/providers/comfyui-provider.ts`)
behind `POST /api/v1/image-edit/run` (`src/image-edit/routes.ts:69` `handleRun`); generation side via `generateComfyUI`
(`src/generation/image-engine/comfyui.ts`) + `handleImageGeneration`
(`src/generation/image-gen-route.ts`). Both callers poll today.

## Acceptance Criteria

- [ ] `ComfyUIClient.submitWorkflow` accepts optional `client_id` and sends it in the `/prompt` body; executions scope per client (multi-client disambiguation)
- [ ] New `subscribeProgress(promptId, clientId, onEvent)` opens `/ws?clientId=...`, routes execution events to `onEvent`, closes on terminal state; poll remains as fallback when WS unavailable
- [ ] `ComfyUIEditProvider.execute` and `generateComfyUI` surface progress (percentage / node / preview image) to their callers without changing result shapes
- [ ] `POST /api/v1/image-edit/run` exposes progress to the frontend (SSE or WS fan-out); gallery/template UI shows live progress instead of spinner
- [ ] Tests: `src/generation/providers/comfyui.test.ts` covers `client_id` body + WS event routing (mock socket); fallback-to-poll covered when WS fails

## Related

- `epic-comfyui-plugin.md` (Phase 0 `client_id` prereq, Phase 4 WS item)
- `src/generation/providers/comfyui.ts` (client), `src/image-edit/providers/comfyui-provider.ts` (edit consumer)
- `TASK-assistant-creative-studio-workflow-gallery-edit.md` (gallery UX consumer of progress)
