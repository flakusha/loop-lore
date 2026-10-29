<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: voice Phase 0 spike: web push-to-talk fill-input

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-audio-video-sound
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Phase 0 spike (source doc section 12, 1 week). Voice as control surface baseline: web-only push-to-talk that fills the chat input, no auto-send, no router, no commands table. Scope: one Alpine mixin beside chatVoiceNote methods plus button wiring. Hold-Space when input unfocused records via SpeechRecognition (Chrome/Edge; else unsupported toast reusing chats.voiceUnsupported pattern), streams interim transcript into the chat input; release leaves final text editable in input (NO auto-send, NO router, NO commands table). getUserMedia with noiseSuppression, echoCancellation, autoGainControl.

Owner: epic-audio-video-sound.md (Not Started, coordination hub; no generation dispatch exists). Loop-lore has voice-note capture-only (startVoiceRecording MediaRecorder + POST voice-notes, no STT, no commands), TTS prompt templates only with no synthesis (FEAT-089/090/091 future, apply route answers 501), PeerWorkloadClass.Tts with cancellation wiring only. Missing: no src/voice/ (no commands registry, parser, router, tts-confirm, audit), no SpeechRecognition usage, no wake-word/VAD, no voice_command_log table, no keybind/push-to-talk, TUI has no mic path.

Internet: ADOPT Web Speech API push-to-talk with fill-input (read-only nav executes, chat.send fills input for edit); hold-Space-when-unfocused keybind. ADAPT VAD end-of-utterance via vad-web for Phase 1; wake-word via openwakeword_wasm hey_jarvis for Phase 2; LLM intent fallback via aux intent-route template (composes with classify Phase 0 spike). DEFER TUI mic, always-on listening, server Whisper fallback, TTS confirmations + barge-in, undo stack, voice_command_log audit table, cloud STT, multi-language grammar i18n.

Refs: .tmp/meta-research/jarvis-voice-control.md; https://github.com/dscripka/openWakeWord; https://github.com/dnavarrom/openwakeword_wasm; https://github.com/ricky0123/vad

Acceptance: Space-hold in Chrome fills input with interim + final transcript; release leaves text editable, nothing sent; Firefox shows unsupported toast, voice-note path untouched; mic permission denied gives toast, no exception; existing voice-note record-upload-send flow still green (chat-voice-notes.test.ts passes); no new dep, no src/voice/ scaffold, no audit table; deferred items listed as follow-ups.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
