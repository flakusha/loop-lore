<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Per-character voice binding for TTS providers (ElevenLabs shape)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Character TTS is zero: voice-notes is user-upload only, while TASK-ELEVENLABS-TTS-PROVIDER-FEAT-089 / TASK-OPENAI-TTS-WHISPER-STT-PROVIDER-FEAT-090 / TASK-LOCAL-VOICE-PROVIDERS cover providers without a per-character binding. Risu shape (research 07 sec 2): voice slot per character, provider override like imageProvider, rendered as audio in the existing media-voice bubble. Complements, does not duplicate, the provider tickets. Research: .tmp/research/ai-cheat/07-character-avatar-emotion-voice.md gap 2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
