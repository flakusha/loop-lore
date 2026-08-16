<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TTS Provider Interface + Edge-TTS Integration

**Priority:** High
**Status:** ⬜ Not Started
**Epic:** epic-audio-video-sound

## Description

Create a TTS provider interface and implement Edge-TTS (free, local) as the
first provider. Edge-TTS uses Microsoft's edge TTS service with no API key
required.

## Acceptance Criteria

- [ ] `TTSProvider` interface defined (`synthesize`, `listVoices`, `getCapabilities`)
- [ ] Edge-TTS provider implements the interface
- [ ] Voice selection per character (stored in character settings)
- [ ] Emotion/tone parameter mapping (speed, pitch, volume)
- [ ] Audio output saved as asset, linked to message
- [ ] `POST /api/tts/synthesize` route
- [ ] `GET /api/tts/voices` route (list available voices)
- [ ] Unit tests for TTS provider

## Technical Notes

- Edge-TTS uses WebSocket connection to Microsoft's edge service
- Package: `edge-tts` (npm) or direct WebSocket implementation
- Audio output format: MP3 or WAV
- Consider streaming for long text (>500 chars)
