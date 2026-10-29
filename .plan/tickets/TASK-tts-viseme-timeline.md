<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: tts-viseme-timeline

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-tts-foundation
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

TTS audio plus client-side viseme timeline (amplitude fallback first, phoneme later); mouth-lead ~40ms; p50/p95 budget table instrumented. Owner epic: epic-tts-foundation (parent epic-audio-video-sound). Anchors: src/frontend/vn/scene-renderer/ (animation stage); src/assets/service/delete.ts:84-85; epic-tts-foundation.md (Not Started, provider abstraction is the sequence predecessor). Refs: https://github.com/met4citizen/TalkingHead (viseme pipeline); https://github.com/pixiv/three-vrm (VRM expressions). Acceptance: TTS audio + client viseme timeline; ~40ms mouth-lead; budget table instrumented. DEFER: hosted TTS avatar services. Source: internet-expansion research 2026-10-29.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
