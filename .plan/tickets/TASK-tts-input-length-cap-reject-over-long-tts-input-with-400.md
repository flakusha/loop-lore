<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: tts-input-length-cap: reject over-long TTS input with 400

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-tts-foundation.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The TTS template layer `src/generation/audio-prompt-profiles.ts` (Edge / ElevenLabs / OpenAI / Piper / Bark rows) has no input cap — the loop-lore analogue of honkbox's uncapped `SpeechRequest`. Cap the TTS text input (characters, or a derived PCM duration) and reject over-long input with an explicit 400 BEFORE provider dispatch, matching the repo's reject-not-clamp policy.

**Context:**

- Seam: `src/generation/audio-prompt-profiles.ts`.
- Acceptance: an over-long request returns 400 naming the limit; the boundary value is accepted.
- Reject, never clamp — same rule honkbox applies to `cfg_scale` / `strength`.
- Epic: `epic-tts-foundation.md` (Status Not Started).

**Drift flag (for the epic owner):** parent epic `epic-audio-video-sound.md` (Status Not Started) claims no audio/video dispatch exists, but `src/generation/video-engine.ts` and `src/generation/video-gen-route.ts` do exist, and `epic-video-generation.md` is In Progress (Phase-A `33f7461de`) — the parent epic's premise is stale.

**Related:**

- `.tmp/research/honkbox-fullcycle-integration-review.md:195` (finding B4)
- honkbox `TASK-speech-input-cap.md` (Status: proposed) — the mirror ticket; rejects with 400, never clamps
- honkbox `epic-output-formats.md` (Status: proposed) — the honkbox epic that lists the mirror ticket
- `src/generation/audio-prompt-profiles.ts` (seam)

**Acceptance Criteria:**

- [ ] TTS text input is capped (explicit character limit or derived PCM-duration limit) and the limit is documented in the ticket's resolution notes.
- [ ] An over-long request returns 400 before any provider dispatch, with a message naming the limit.
- [ ] A request exactly at the limit is accepted unchanged.
- [ ] No silent truncation or clamping of the TTS text.
- [ ] Regression test covers over-limit (400) and at-limit (accepted) inputs.
- [ ] Tests passing, docs updated.
