<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: C3: Quiet-hours-aware federated world-event notices

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-instance-federation
**Tags:** composition, matrix-c3

**Summary:**

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Summary:** One inbound federated event type becomes a local proactive candidate, gated by the existing quiet-hours window and anti-spam backoff -- remote events can never bypass local throttling.
**Context:** Composes B5 (receiveDelivery/fanOutContent, src/federation/) + B8 (checkShouldMessage, quiet-hours plus backoff, src/chat/proactive/) + B1 (notifySystem). Phase-1 slice: src/chat/proactive/index.ts candidate scorer + triggers.ts (in-app only, no fan-out) + delivery.ts receive hook. Score 3 (V2/E2/R1/U1), band next. Per-sender cap in phase 1 against spam amplification. Next-wave only, never the 0.1.0 tag.
**Acceptance Criteria:** one inbound federated event type scored as proactive candidate; quiet-hours window enforced; anti-spam backoff enforced per sender; in-app only with no fan-out; bun run check green.
**Parents:** 03-X7 (concretizes its phase-1 slice: one inbound federated event type as a local notification).
**X-map:** 03-X7 is covered by this ticket; do NOT file X7 separately.
**Related:** Siblings TASK-c1-moderation-action-notices-with-actor-thumb, TASK-c2-bridged-turn-skip-propagation-bridge-only, TASK-c4-inbound-federated-content-verdict-notices.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
