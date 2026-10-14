<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Scene-Aware Music Generation (Ambient & Music SFX Epic, Phase 2)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-ambient-music-sfx
**Summary:** Scene-aware music generation: mood/scene tags -> audio asset via the audio provider interface.
**Context:** Phase 2 of epic-ambient-music-sfx (Phases 2-3 of epic-audio-video-sound). Verified 2026-10-14: the audio prompt-template layer exists (src/generation/audio-prompt-profiles.ts - families stable-audio/musicgen/riffusion; src/generation/audio-prompt-templates.ts) and POST /api/templates/audio CRUD is built, but POST /api/templates/audio/:id/apply answers 501 because no audio provider exists. The provider interface + registry land with TASK-ambient-sound-system; this ticket consumes them.
**Acceptance Criteria:** see list below.


## Description

Generate scene-appropriate background music (tense, calm, combat) and store it as an
audio asset. Scene/mood selection maps through the existing audio prompt profiles -
no new prompt layer.

## Acceptance Criteria

- [ ] `POST /api/audio/music` route (mood/scene tags + duration -> audio asset)
- [ ] Scene/mood -> profile mapping via the existing audio prompt profiles (combat -> intense, rest -> calm)
- [ ] Music provider implemented against the audio provider interface from TASK-ambient-sound-system
- [ ] Generated track stored as an audio asset and linked, URL returned
- [ ] Unit tests for mood mapping + route dispatch

## Out of scope

- Frontend player (TASK-audio-player-component)
- Per-chat volume/mixing settings (needs a settings column)
- Narration timestamping (epic-narration-pipeline)
