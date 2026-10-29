<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Video Generation

**Overview:** (see sections below)

**Status:** Not Started
**Status Note:** Rewritten 2026-10-28 (plan branch `plan-ivss`) from the IVSS research package; supersedes the Wan/LTX stub in place. ComfyUI is the **unified** generation backend across creative AND chat/avatar flows (user decision 2026-10-28). sdcpp's disposition decided 2026-10-29: opt-in lightweight fallback (see Decisions).
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** video, generation, wan, ltx, comfyui, director, gpu-gating, byok
**Parent Epic:** Audio, Video & Sound Generation (epic-audio-video-sound.md)

## Overview

This epic owns the **engine tier list** for video generation: the flow
workflows (t2v, i2v with first frame, first+last-frame, VACE mask-edit,
continuation, camera control), the Director first-class default tier
(operator decision 2026-10-29, license terms recorded),
the post stages (interpolation, upscale, audio-for-video, lip-sync), GPU
capability gating, and the BYOK cloud tier. It is the seam
`epic-image-video-scenario-studio.md` consumes to run and edit scenes;
that epic owns the scenario document, run pipeline product surface, and
editing tiers. The filed video tickets (`TASK-video-gen-route`,
`TASK-video-template-schema`, `TASK-video-provider-minimax-h3`) fold into
this epic's phases below.

## Backend stance

ComfyUI is the unified generation backend for ALL creative surfaces —
image, video, and the chat/avatar path alike. Video runs submit workflow
JSON through the kind-aware ComfyUI client; local ComfyUI workflows are
the default, the consent-gated BYOK Kling tier is in scope for the first
release (behind BYOK consent + `epic-byok-api-keys.md`), and the
Veo-via-Gemini cloud tier stays a later addition. sdcpp is not a
video target: its only video surface is an undocumented endpoint the repo
never calls; its disposition is decided (opt-in lightweight fallback, see
Decisions).

## Engine / flow tiers

All tiers land as workflow-library rows
(`epic-comfyui-first-class-citizen.md`) with acceptance probes, parameter
maps, and license/VRAM fences recorded on the row; model acquisition
(weight download) is part of each probe.

| Tier | Models | Fence |
| ---- | ------ | ----- |
| t2v (default family) | Wan 2.2 TI2V-5B core native template | Apache-2.0 — shippable default |
| i2v first-frame / first+last-frame | Wan 2.2 i2v (core); Wan 2.1 FLF2V-14B FP8 or Wan 2.2 FLF | Apache-2.0 |
| v2v mask-edit + extend | Wan 2.1 VACE (core native inpaint/reference/extend) | Apache-2.0 |
| camera control / orbit | Wan2.2-Fun-Camera-Control (core) | Apache-2.0 — consumed by the view-set orbit tier |
| Director default tier | MiniMax H3 via DaSiWa Director + KJNodes + GGUF packs | **First-class default tier in this instance** (operator decision 2026-10-29); MiniMax H3 community-license terms recorded as informational fence metadata on the workflow row |
| speed tier + native audio | LTX-2/2.5 distilled | Community license — fenced for redistribution |
| post: interpolation | Core FrameInterpolate + rife | per-model fences on the row |
| post: upscale | Latent tile upscale + model SR (+ RTX VSR on NVIDIA; SeedVR2 restore option) | per-model fences |
| post: audio-for-video / lip-sync | MMAudio (MIT); LatentSync (Apache-2.0 code / openrail++ weights) | per-row fences |
| BYOK cloud — Kling (in scope) | Kling partner nodes | consent gate, BYOK keys (`epic-byok-api-keys.md`) |
| BYOK cloud — Veo (later) | Veo via Gemini API | consent gate, BYOK keys |

GPU gating is per-workflow `min_vram` + capability probes against the
local engine, surfaced as run errors with the probe's explanation — not a
build-time device assumption.

## Phases

### Phase A — workflow template schema + run route (folded filed tickets)

- [ ] `TASK-video-template-schema` — video workflow template schema (duration→frames at the template's fps, output kind `video`)
- [ ] `TASK-video-gen-route` — `/api/generation/video` route: submit, track, persist clip asset + playback
- [ ] `TASK-video-provider-minimax-h3` — **rescoped by this filing**: local ComfyUI workflow runs (Director tier) replace the BYO-key API client as the default; the API tier moves behind BYOK
- [ ] Wan family workflow rows with probes (t2v, i2v-ff, FLF2V, VACE-edit, camera-orbit)

### Phase B — post stages + Director tier

- [ ] Post-stage workflow rows (interpolation, upscale, MMAudio, LatentSync) — toggleable, license-fenced
- [ ] Director tier rows (first-class default in this instance; license terms recorded on the row)
- [ ] LTX speed tier rows (community-license-fenced)

### Phase C — BYOK cloud remainder (later, consent-gated)

- [ ] Kling partner-node tier behind BYOK keys and explicit consent (in scope for the first release, consent gate required)
- [ ] Veo-via-Gemini tier (later)

## Key integrations

- ComfyUI provider (`src/generation/providers/comfyui.ts`) — video-kind
  submit/poll; the first video-kind consumer of
  `waitForFiles`/`runWorkflowFiles` lands with the IVSS run pipeline
- Assets: `video` MIME type already exists in `src/db/enums-content.ts`
- Multimodal Asset Reuse (`epic-multimodal-asset-reuse.md`): from-asset
  i2v continuation reuses the i2v tiers defined here
- Image/Video Scenario Studio (`epic-image-video-scenario-studio.md`):
  consumes these seams for scenario runs and editing tiers

## Non-goals

- Scenario/scene/shot documents, the run-pipeline product surface, and
  editing tiers (`epic-image-video-scenario-studio.md`)
- Transport (`client_id`/`/ws`) — `epic-comfyui-plugin.md`
- Audio *generation* (TTS/music epics); native-audio model tiers are rows
  here

## Dependencies

- Parent hub: Audio, Video & Sound Generation (`epic-audio-video-sound.md`)
- `epic-comfyui-first-class-citizen.md` — workflow library rows
- `epic-comfyui-lifecycle.md` — provisions the local engine
- `epic-external-tooling-build.md` — weight/model acquisition posture

## Decisions (2026-10-29)

- **sdcpp disposition (1b):** opt-in lightweight fallback tier — no new
  capability work; revisit after IVSS ships. No video work targets sdcpp.
- **BYOK cloud tiers (2b):** the Kling consent-gated tier is in scope for
  the first release; Veo-via-Gemini stays later — both behind
  `epic-byok-api-keys.md` consent.
- **Director/H3 stance (3a):** first-class default tier in this instance
  (operator decision); MiniMax H3 community-license terms recorded as
  informational fence metadata on the workflow row; Wan stays the
  Apache-2.0 engine family alongside.
- **GPU gating:** per-workflow `min_vram` + capability probes; exact
  floors recorded per workflow row at probe time.

## Related

- [`TASK-video-template-schema.md`](../tickets/TASK-video-template-schema.md)
- [`TASK-video-gen-route.md`](../tickets/TASK-video-gen-route.md)
- [`TASK-video-provider-minimax-h3.md`](../tickets/TASK-video-provider-minimax-h3.md)
- [`epic-image-video-scenario-studio.md`](./epic-image-video-scenario-studio.md) — product-surface consumer
- [`epic-audio-video-sound.md`](./epic-audio-video-sound.md) — parent hub
- [`epic-multimodal-asset-reuse.md`](./epic-multimodal-asset-reuse.md) — from-asset i2v
- [`epic-comfyui-first-class-citizen.md`](./epic-comfyui-first-class-citizen.md) — workflow library
- [`epic-comfyui-lifecycle.md`](./epic-comfyui-lifecycle.md) — engine provisioning
- [`epic-byok-api-keys.md`](./epic-byok-api-keys.md) — cloud tier keys
- [`epic-view-set-generation.md`](./epic-view-set-generation.md) — orbit-tier consumer
