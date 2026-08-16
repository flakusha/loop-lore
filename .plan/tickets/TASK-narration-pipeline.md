<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Narration Pipeline — TTS + Ambient + SFX Mix

**Priority:** High
**Status:** ⬜ Not Started
**Epic:** epic-audio-video-sound (Phase 6)

## Description

Full narration pipeline that reads messages aloud with character voice,
emotion, and ambient sound backing. Combines TTS (speech), ambient (scene),
and SFX (actions) into a mixed audio track.

## Current State

- Message structure exists with narration markers (`*action*`, `"dialogue"`)
- Character settings exist (personality, speech patterns)
- Asset system supports audio files + linking
- No TTS, ambient, or SFX systems exist yet

## Acceptance Criteria

- [ ] Message parser extracts segments: speech, action, description
- [ ] Speech segments → TTS with character voice preset
- [ ] Description segments → ambient backing track selection
- [ ] Action segments → SFX injection at correct timestamp
- [ ] Audio mixer combines tracks with proper volume/timing
- [ ] `POST /api/narration/generate` route (message_id → narration asset)
- [ ] Narration playback controller with per-layer volume
- [ ] Synchronized text highlighting (karaoke mode)
- [ ] Cache generated narration for replay
- [ ] Unit tests for message parsing + segment extraction

## Technical Notes

### Message Segment Types

```typescript
interface NarrationSegment {
  type: "speech" | "action" | "description" | "narrator";
  text: string;
  character_id?: string; // for speech segments
  emotion?: string; // extracted from context
  sfx_hint?: string; // for action segments
  ambient_hint?: string; // for description segments
}
```

### Emotion Detection

Simple regex-based first pass:

- `"text"` → speech (normal)
- `"text"!*` → speech (excited)
- `"text"...` → speech (hesitant)
- `*whispers*` → speech (whisper)
- `*shouts*` → speech (loud)
- `*laughs*` → SFX (laugh)
- `*sighs*` → SFX (sigh)

### Mixing Strategy

1. TTS generates speech audio (with emotion params)
2. SFX generates action sounds (timed to action segments)
3. Ambient generates background loop (from location/scene tags)
4. Audio mixer: speech at full volume, ambient at 30%, SFX at 50%
5. Output: single mixed audio file linked to message

### Caching

- Cache key: message_id + character_id + settings hash
- Cache invalidation: on character voice change, settings change
- Storage: composite asset with metadata { speech, ambient, sfx_sources }
