<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Per-reply emotion classify-to-sprite loop (ST classify pattern)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

ST Character Expressions lesson (research 07 sec 2): we generate 18 emotions but nothing picks the sprite per reply. Portable pattern: one small classifier (main-LLM Limited-context prompt or local ONNX) mapping reply text to emotion label, feeding existing selectAvatar(ctx.emotion) plus mood-service state. Home: aux-pipeline/ classify prompt + characters avatar-service selection call-site. Research: .tmp/research/ai-cheat/07-character-avatar-emotion-voice.md gaps 1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
