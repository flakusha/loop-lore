<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Voice notes playback

**Epic:** epic-chat-rich-engagement.md (proposed)
**Type:** Feature | **Priority:** Low | **Effort:** M

## Problem
Zero voice-note implementation (grep `voice.*note|audio.*message` clean).
Asset pipeline exists (`src/assets/`) but no audio-message type or
inline player. AI-chat parity (mobile voice input) missing.

## Change
- Reuse asset upload: allowlisted audio mimes per `validateMimeType` (e.g. audio/ogg verified) ≤5MB, store as asset_link
  with `kind=voice`; render inline `<audio>` player in bubble + TUI
  fallback link. No new storage backend.
- Frontend: record via MediaRecorder → existing asset attach flow;
  waveform optional v2 (`// ponytail: no waveform, native controls`).
- Duration + mime validated server-side; NSFW/audio moderation out of scope.

## Acceptance
- Record → send → inline play round-trips; oversize/non-audio → 422.

## Non-goals
- STT transcription / TTS (epic-audio-video-sound).
