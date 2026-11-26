<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Honkbox audio routes for TTS STT VAD

**Status:** Blocked
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-tts-foundation
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: narration and voice dispatch plus voices admin surface; local and no-op fallback. AC: capability off keeps local behavior byte-identical. Depends: honkbox T3 release feature set with audio engine and vad.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
