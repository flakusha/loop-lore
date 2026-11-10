<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Prompt-driven audio generation route + live /sfx and /music commands

**Status:** Done
**Status Note:** implemented on branch `feat-audio-gen-route` (pending merge to dev) — `src/generation/audio-prompt-route.ts` (the route) + `audio-prompt-route.test.ts` (auth matrix, 501 gate, success path), `src/generation/controller.ts` (route registration), `src/assistant/commands/sfx.ts` + `music.ts` (live commands), `src/frontend/alpine/chat-actions/dispatch.ts` (generate-sfx / generate-music / link-music handlers)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-ambient-music-sfx
**Related:** `TASK-ambient-sound-system.md`, `TASK-audio-player-component.md`, `BUG-ambient-audio-route-links-generated-assets-to-arbitrary-mess.md`
**Caveats:** the route needs an operator-configured audio provider (`generation.providers.audio`); the procedural `local` bank is refused with 501 because it is a texture bank, not a prompt model

**Summary:**

Add POST /api/v1/generation/audio (src/generation/audio-prompt-route.ts): a prompt-driven audio track route mirroring the ambient route's auth contract (401 unauthenticated, 403 foreign chat, 404 unknown message, 400 bad prompt/seconds/mismatched message-chat pair), resolving the provider from the registry and refusing the procedural 'local' bank with 501 when no operator-configured audio provider exists. The track persists as an audio asset (createAsset + linkAsset chat/message). The /sfx (aliases /sound) and /music assistant commands stop being 'not implemented yet' stubs: they return a generate-sfx / generate-music action, and the frontend dispatch posts it to the new route; /music with an external URL links it through the existing chat music-links API. Both commands are gated on a configured audio provider, mirroring /image and /video.

**Context:**

The audio provider layer exists (`src/generation/audio/`: registry, ComfyUI provider, local procedural bank) and the ambient route (`POST /api/v1/generation/audio/ambient`) persists a track as an audio asset. What was missing was the prompt-driven path the epic still lists as open (`epic-ambient-music-sfx.md`: "Still to build — `src/generation/audio/music.ts`, `src/generation/audio/sfx.ts`"), so `/sfx` and `/music` stayed `available: false` stubs that answered "generation is not implemented yet".

The commands run server-side and cannot reach the frontend action dispatch from the handler, so the command returns an action and the frontend posts it — the same shape `/image` uses (`src/frontend/alpine/chat-actions/dispatch.ts`). The route mirrors the ambient route's auth contract, including the `messageId` → chat resolution that `BUG-ambient-audio-route-links-generated-assets-to-arbitrary-mess` fixed there (404 unknown message, 400 message/chat mismatch, access check on the resolved chat).

Two constraints shaped the design: (1) the procedural `local` provider is a texture bank — mapping a prompt onto it would return a bed instead of the requested sound, so the route refuses it with 501 and the ambient route keeps the procedural path; (2) the command availability gate mirrors `/image` and `/video` (hidden from `listCommands()` unless a provider is configured) instead of a runtime check that would have to duplicate the provider resolution.

**Acceptance Criteria:**

- [x] `src/generation/audio-prompt-route.ts` exports `handleAudioGeneration` with the ambient route's auth contract: 401 unauthenticated, 404 unknown `messageId`, 400 message/chat mismatch, 403 foreign chat, 400 empty/over-long prompt, 400 out-of-range seconds
- [x] The route refuses the procedural `local` bank with 501 (no operator-configured audio provider) and otherwise resolves the provider from the registry (`resolveAudioProvider`)
- [x] The track persists via `createAsset` (`assetType: "audio"`, `dedupe: false`) + `linkAsset` message/chat links, and the response carries the asset id/url/filename/mimeType/seconds/provider
- [x] `POST /api/v1/generation/audio` is registered in `src/generation/controller.ts` next to the ambient route
- [x] `/sfx` (aliases `/sound`) and `/music` return a `generate-sfx` / `generate-music` action with the prompt and a default length; both are gated on a configured audio provider (hidden from `listCommands()` otherwise), mirroring `/image` and `/video`
- [x] The frontend dispatch posts `generate-sfx` / `generate-music` to the new route; `/music` with an external URL links it through the existing chat music-links API (`addMusicLink`)
- [x] Unit tests: route auth matrix + 501 gate + success path (fake provider), command action contract, frontend dispatch wiring
- [x] CHANGELOG entry under Unreleased/Added
