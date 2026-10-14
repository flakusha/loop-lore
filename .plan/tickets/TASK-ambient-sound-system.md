<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Ambient Sound System

**Effort:** High
**Summary:** Location-based ambient audio: scene tags → layered, mixed, crossfaded ambient track stored as an asset.
**Context:** Sub-task of epic-ambient-music-sfx (Phases 2–3 of epic-audio-video-sound). The audio prompt-template layer already exists (FEAT-065-SUB-AUDIO, Done — `src/generation/audio-prompt-templates.ts`, `src/generation/audio-prompt-profiles.ts`) and audio templates are CRUD-able via `POST /api/templates/audio`, but generation dispatch behind `POST /api/templates/audio/:id/apply` answers 501 (no audio provider exists). This ticket builds the ambient half of that missing dispatch.
**Acceptance Criteria:** see list below.


**Priority:** Medium
**Status:** Done
**Scope:** Ambient, Music & SFX epic implementation + plan clarification (epic-audio-video-sound hub reconciliation)
**Epic:** epic-audio-video-sound

## Description

Create a location-based ambient sound system that generates layered background
audio based on scene tags (forest, night, rain, city, etc.).

## Acceptance Criteria

### Generation core

- [x] Audio provider interface + registry in `src/generation/audio/` (register / resolve by config), mirroring the image-provider pattern — `types.ts` (register/resolve/list) + `engine.ts`
- [x] ComfyUI audio provider (Stable Audio Open workflow) reaching an existing ComfyUI endpoint; audio output extraction added to the ComfyUI client — `waitForFiles`/`runWorkflowFiles` read terminal `audio` + `gifs` outputs
- [x] Scene tags → audio prompt composition via the existing audio prompt profiles — `buildAmbientLayers` uses `resolveAudioProfile` / `buildAudioPromptMessages`
- [x] WAV encode/decode + layer mixing with crossfade — `wav.ts` (`encodeWav`/`decodeWav`/`mixLayers`), per-layer 1.5s fades
- [x] Generated track stored as an `audio` asset and linked (chat or message), URL returned to the caller — `createAsset` + `linkAsset` in `audio-gen-route.ts`

### API

- [x] Ambient generation route — real path `POST /api/v1/generation/audio/ambient` (mounted by `generationRoutes`, `/api/v1` prefix); body `{ tags, duration_sec, intensity, mood, seed, provider, chatId?, messageId? }`; returns `{ data: { id, url, filename, mimeType, seconds, provider, layers } }`
- [x] Template `apply` seam: `POST /api/v1/templates/audio/:id/apply` renders the template body with the apply `context` into scene tags and dispatches; video stays 501

### Explicitly out of scope for this ticket

- Frontend audio player + ambient controls (TASK-audio-player-component)
- Per-location override settings (needs a chat/location settings column — separate ticket)
- Track caching (YAGNI until a repeat-generation cost shows up)
- Scene-tag extraction from world/location metadata: consume whatever location metadata already exposes; a location→tags mapping ticket is separate

## Technical Notes

- Prompt layer already exists: `src/generation/audio-prompt-profiles.ts` (stable-audio / musicgen / riffusion families), `src/generation/audio-prompt-templates.ts`
- `POST /api/templates/audio/:id/apply` is the wired-but-501 seam: `src/routes/templates/modality.ts:189-201`
- ComfyUI client is image-only: `src/generation/providers/comfyui.ts` extracts `images` from workflow outputs; terminal sinks `SaveAudio`/`SaveVideo` are not read
- `/sfx` and `/music` assistant commands are registered `available: false` stubs (`src/assistant/commands/sfx.ts`, `music.ts`) — re-advertise only once generation works
- Mixing happens server-side on decoded PCM here; browser-side Web Audio mixing (per epic design) stays a frontend concern
- Layering: compose N layers (ambient base + weather + time-of-day), each generated with its own prompt/volume/loop, then mix with per-layer gain and crossfade tails

## Verification Notes (2026-10-14)

Implementation landed on branch `epic-ambient-music-sfx`. All acceptance criteria met;
the remaining Phase 2/3 epic items (music route, SFX surface) are outside this ticket.

| Claim | Evidence |
| --- | --- |
| Provider registry + resolution order | `src/generation/audio/types.ts`, `src/generation/audio/engine.ts`; order = explicit id → first `comfyui:*` → `local`, else 503. Tests: `src/generation/audio/engine.test.ts` |
| ComfyUI audio extraction | `src/generation/providers/comfyui.ts` `waitForFiles` / `runWorkflowFiles` (terminal sinks `audio`, `gifs`); tests: `src/generation/providers/comfyui.test.ts` |
| Ambient planning + mixing | `src/generation/audio/ambient.ts`, `src/generation/audio/wav.ts`; tests: `ambient.test.ts`, `wav.test.ts` |
| Ambient route | `src/generation/audio-gen-route.ts` — 401 unauthenticated, 403 on foreign `chatId`, 400 on bad tags/duration/intensity, asset + optional chat/message links on success. Tests: `src/generation/audio-gen-route.test.ts` |
| ComfyUI run outcomes | provider maps an unloadable workflow to 500, a completed run's `audio` sink to the downloaded buffer (single `/view` fetch), and a failed run to 502 with the provider error surfaced. Tests: `src/generation/audio/providers/comfyui.test.ts` |
| Local provider synthesis | deterministic per seed across the texture catalogue, prompt-derived seed, unknown-texture bed fallback, one-second duration clamp. Tests: `src/generation/audio/providers/local.test.ts` |
| Template apply seam | `src/routes/templates/modality.ts` — audio renders `{{vars}}` from `context` into tags and dispatches; 400 when the body renders nothing; video still 501. Tests: `src/routes/templates/modality.test.ts` |
| Smoke | `bun test` green (audio module 53 tests); typecheck, eslint, dprint, knip, wiring, jscpd, size, coverage-gap and per-module coverage gates green |

Route path correction vs. the original ticket text: the route lives under the
generation controller prefix — `POST /api/v1/generation/audio/ambient`, not
`/api/audio/ambient`; the upload dir comes from `config.assets.uploadDir`.

**Resolved:** 2026-10-14 registry-driven close: git issue 464d1ba (registry tip: 80003208d Konstantin Fedotov Auto-closed: appended .md marker marks TASK-AMBIENT-SOUND-SYSTEM done)
