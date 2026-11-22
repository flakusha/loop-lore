<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# FEAT: ComfyUI websocket progress client

**Summary:** ComfyUI WebSocket progress client: the provider opens the ComfyUI `/ws` endpoint and streams progress for the prompt it submitted.
**Context:** Shipped on dev — `src/generation/providers/comfyui-progress.ts:43-69` (WebSocket connect, progress parsing) and `src/generation/providers/comfyui.ts:163` (per-call `client_id`). The progress stream is informational; completion is detected by the normal poll path.
**Acceptance Criteria:**
- [x] Progress client connects to the ComfyUI `/ws` endpoint
- [x] Per-call `client_id` correlates the subscription with the submitted prompt
- [x] Progress is informational only and does not replace the completion poll
**Effort:** (none captured)

**Status:** Done
**Status Note:** Shipped on dev — `src/generation/providers/comfyui-progress.ts:43-69`, `src/generation/providers/comfyui.ts:163`.
**Priority:** medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

Imported from git issue b231882.

git issue: b231882
