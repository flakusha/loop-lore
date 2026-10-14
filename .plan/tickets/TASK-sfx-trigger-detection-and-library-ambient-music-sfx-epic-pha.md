<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: SFX Trigger Detection and Library (Ambient & Music SFX Epic, Phase 3)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-ambient-music-sfx
**Summary:** Event-driven SFX: detect action cues in message text, resolve from library or generation, return volume/position-tagged layers.
**Context:** Phase 3 of epic-ambient-music-sfx (Phases 2-3 of epic-audio-video-sound). Verified 2026-10-14: /sfx and /music assistant commands are registered available:false stubs (BUG-advertised-sfx-music-video-commands-are-stubs resolved by de-advertising, not implementing); no SFX library or trigger detection exists. Trigger detection and the library are provider-independent and can land before any audio provider.
**Acceptance Criteria:** see list below.


## Description

Detect action cues in message text (`*door creaks open*`, action verbs), resolve each to
a sound effect from a library of common sounds or by generating one, and return the
layers with volume + spatial position for the caller to mix.

## Acceptance Criteria

- [ ] Trigger detection over message text (action verbs / `*asterisk action*` markers -> SFX cue list)
- [ ] SFX library lookup (pre-generated common sounds: door, sword, spell, footstep)
- [ ] SFX generation dispatch for uncued sounds (Bark or ComfyUI provider)
- [ ] `POST /api/audio/sfx` route returning layer(s) with volume + spatial position
- [ ] Unit tests for the trigger matcher (positive + negative cases)
- [ ] Re-advertise the /sfx assistant command once generation works

## Out of scope

- Timestamped insertion into narration (epic-narration-pipeline)
- Browser-side spatial audio
- Generating the library audio itself (asset upload/procedural authoring is separate)
