<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Video provider — MiniMax H3 dispatch

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** `epic-audio-video-sound` (Phase 4 via `epic-video-generation.md`)
**Related:** `TASK-video-gen-route.md`, `TASK-video-template-schema.md`, `FEAT-065-sub-video.md`, `TASK-assistant-third-party-api-integration.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Implement the MiniMax H3 video provider client behind the video generation
route (`TASK-video-gen-route.md`): payload build, async submit/poll, result
download into the asset pipeline. This is the provider implementation — the
dispatch-adapter layer in `TASK-assistant-third-party-api-integration.md`
(which already names `minimax-h3` as a model family with a `dispatch.backend:
api_call` target) stays untouched; this ticket fills the target it points at.

## Context

Scope boundary (do not duplicate): `TASK-assistant-third-party-api-integration.md`
owns the `ThirdPartyAdapter` interface, the `third-party-adapters.yaml`
registry, payload building from workflow steps + model-family presets
(`configs/templates/workflows/model-families.yaml`), and routing through the
LLM queue. Its Non-goals state explicitly: implementing actual API provider
clients lives here (`epic-audio-video-sound.md` /
`epic-assistant-generation-extensions.md`). The workflow config already
references a `video-minimax-h3` workflow (`src/config/workflow-templates.test.ts:23`)
and the runner test dispatches `{ model: "minimax-h3", prompt }` to
`POST /api/generation/video` (`src/assistant/workflow-runner.test.ts:49-50`)
— the dispatch side waits on this provider. Engine precedent is
`generateSDCPP` (`src/generation/image-engine/sdcpp.ts:17-128`): async submit
→ poll against `generationTimeout` → 504 on timeout. Auth model is BYO key per
the third-party ticket (`auth: byo_key`).

## Acceptance Criteria

- [ ] `src/generation/image-engine/minimax.ts` (or `video-engine/` sibling)
exports `generateMiniMaxH3(config, opts)` with `{ prompt, duration, resolution }`
→ async job submit/poll/download, same outcome shape as `ImageGenOutcome`
- [ ] BYO-key auth: key from user config, never logged; 401/429 from the
provider surface as 502/429 with the provider message (sdcpp precedent `:71`)
- [ ] Wired as a selectable video provider behind `handleVideoGeneration`
  (route returns 501 only when no video provider is configured at all)
- [ ] Unit tests: payload shape per minimax-h3 family, poll/timeout paths,
auth-error mapping — no live API calls
