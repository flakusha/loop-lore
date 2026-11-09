<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Video generation route (`POST /api/generation/video`)

**Status:** Done
**Status Note:** Async submit/poll shape landed in the tree: `handleVideoGeneration` runs all pre-gates then returns 202 `{data:{jobId,status:"pending"}}` with the render on a floating promise (`.catch()` → `failVideoJob`); `handleVideoGenerationStatus` reports pending/done (asset id/url/filename/mimeType/provider)/failed with 401 no user, 404 unknown-or-foreign (oracle rule), and 504 on `generationTimeout` expiry both at poll time and on late resolve. Job store is in-memory (`src/generation/video-jobs.ts`, cleared on restart). Follow-up: HTTP route wiring for the poll shape (GET status path for `handleVideoGenerationStatus`; the submit POST is already registered in `src/generation/controller.ts`). Phase-A note below still stands.
**Phase-A progress (from epic-agentic-integration):** Landed `src/generation/video-engine.ts` (ComfyUI workflow dispatch, cross-instance failover, per-provider BYO keys with fail-closed decrypt, 501/500/502/503/504 mapping), `POST /api/v1/generation/video` in `video-gen-route.ts` (auth contract + template render + storage quota gate + asset persistence as `assetType: "video"`), video provider config (`generation.providers.video`, `VideoApiFamily.Comfyui`), per-modality template apply dispatch (`routes/templates/modality.ts`), API-keys surface listing video instances, config examples, and tests (engine: sink/error/failover/BYOK; route: 401/400/404/403/501 gates; apply seam). Closed by the async slice: the route now returns a 202 job handle with poll/504 instead of blocking (deadline is `generationTimeout`); route-level happy-path/asset-link assertions and a route-level template-render test are written with it.
**Priority:** low
**Caveats:** evidence verified at commit time; re-verify if the video route or provider config changes
**Effort:** Medium
**Epic:** epic-video-generation
**Related:** `TASK-video-provider-minimax-h3.md`, `TASK-video-template-schema.md`, `FEAT-065-sub-video.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Add `handleVideoGeneration` in `src/generation/video-gen-route.ts` mirroring
`handleImageGeneration` (`src/generation/image-gen-route.ts:54-204`): auth +
`checkChatAccess` on `chatId` (`src/chat/service`), template render when
`templateId` is set, provider pick, dispatch, `createAsset` + `linkAsset`
(`src/assets/service`), JSON response. Returns 501 until a video provider
lands (see sibling MiniMax H3 ticket).

## Context

No video pipeline exists: no `src/generation/video-*` files, and
`epic-video-generation.md` is Future-gated on GPU + base pipelines. The image
route is the proven pattern — same auth shape (401 no user, 403 foreign chat),
same `dedupe: false` per-run semantics (`image-gen-route.ts:175`), same
message/chat link labels. The assistant workflow runner already dispatches to
`POST /api/generation/video` (`src/assistant/workflow-runner.test.ts:49-50`),
so the route target exists before the route. Video differs in two ways the
mirror must account for: long-running jobs need the async submit/poll shape
from `src/generation/image-engine/sdcpp.ts:17-128`, not the blocking image
path; and output is `assetType: "video"` (MIME already in
`src/db/enums-content.ts`).

## Acceptance Criteria

- [x] `src/generation/video-gen-route.ts` exports `handleVideoGeneration` with
  the image-route auth contract: 401 without user, `checkChatAccess` 403 on
  foreign `chatId`, 400 on missing prompt, 501 when no video provider is
  configured
- [x] Async job shape: submit → poll with `generationTimeout` deadline → 504
  on timeout, mirroring `generateSDCPP` (`image-engine/sdcpp.ts:79-127`);
  no request holds an HTTP connection through a multi-minute render
- [x] Output persists via `createAsset` (`assetType: "video"`) + `linkAsset`
  message/chat links, `dedupe: false` per-run like the image route
- [x] `templateId`/`context` render through the video template schema from
  `TASK-video-template-schema.md`; non-video modality rejected 400 (image
  route precedent `:88-93`)
- [x] Unit tests: auth matrix (401/403/400/501), timeout path, asset-link
  assertions — mirroring `image-gen-route.test.ts`
