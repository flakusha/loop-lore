<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: TTS/STT backends: Chatterbox server, TTS-Audio-Suite, Parakeet-ONNX

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-tts-foundation
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Audio WIRE deltas from .tmp/research/external-brains/02-repositories.md. devnen/Chatterbox-TTS-Server (self-host, OpenAI-compat API, CUDA/ROCm/CPU — top TTS-per-actor backend, fits existing transports); diodiogod/TTS-Audio-Suite (one ComfyUI pack: Chatterbox, Qwen3-TTS, IndexTTS-2, F5, Higgs, VibeVoice + SRT — single audio-node dep instead of N packs); Deveraux-Parker/parakeet-stt-python (Parakeet TDT 0.6B v2/v3 via ONNX CPU, 25-30x realtime — STT without torch, trigger = realtime caption need). Complements learning-slice verdict (Fish Speech zero-shot first, no finetune lane): these are the serving backends the reference clips play through.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
