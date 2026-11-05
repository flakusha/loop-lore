<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Video generation route (`POST /api/generation/video`)

**Status:** In Progress
**Status Note:** Landed on `feat-comfyui-param-derivation` + `feat-model-rankings` lanes; unlanded phase-A slice lives on `epic-agentic-integration` (Phase A route + engine + tests done, async job shape open).
**Blocker:** HELD with `epic-agentic-integration` — same 095 renumber + lock decision as `TASK-agentic-integration-tests`. Next: land that branch, then re-check this ticket's Phase-A boxes against dev.
**Phase-A progress (from epic-agentic-integration):** Landed `src/generation/video-engine.ts` (ComfyUI workflow dispatch, cross-instance failover, per-provider BYO keys with fail-closed decrypt, 501/500/502/503/504 mapping), `POST /api/v1/generation/video` in `video-gen-route.ts` (auth contract + template render + storage quota gate + asset persistence as `assetType: "video"`), video provider config (`generation.providers.video`, `VideoApiFamily.Comfyui`), per-modality template apply dispatch (`routes/templates/modality.ts`), API-keys surface listing video instances, config examples, and tests (engine: sink/error/failover/BYOK; route: 401/400/404/403/501 gates; apply seam). Still open: the async job shape — the route blocks on the engine's bounded submit/poll/download instead of returning a job handle, so a long render still holds the HTTP connection (deadline is `generationTimeout`); route-level happy-path/asset-link assertions and a route-level template-render test are not yet written.
**Priority:** low
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

- [ ] `src/generation/video-gen-route.ts` exports `handleVideoGeneration` with
  the image-route auth contract: 401 without user, `checkChatAccess` 403 on
  foreign `chatId`, 400 on missing prompt, 501 when no video provider is
  configured
- [ ] Async job shape: submit → poll with `generationTimeout` deadline → 504
  on timeout, mirroring `generateSDCPP` (`image-engine/sdcpp.ts:79-127`);
  no request holds an HTTP connection through a multi-minute render
- [ ] Output persists via `createAsset` (`assetType: "video"`) + `linkAsset`
  message/chat links, `dedupe: false` per-run like the image route
- [ ] `templateId`/`context` render through the video template schema from
  `TASK-video-template-schema.md`; non-video modality rejected 400 (image
  route precedent `:88-93`)
- [ ] Unit tests: auth matrix (401/403/400/501), timeout path, asset-link
  assertions — mirroring `image-gen-route.test.ts`
