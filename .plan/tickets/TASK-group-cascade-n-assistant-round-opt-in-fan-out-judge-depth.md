<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: group cascade N-assistant round (opt-in fan-out + judge depth)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-group-chat
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Consensus arena proposal 1. Opt-in cascade_mode sequential|fan-out: one depth runs K<=3 personas parallel, judge depth writes visible message; losers as swipe_index siblings tagged cascade_candidate; all verifyCascadeActor gates per branch; max_turns counts visible only. Every branch runs verifyCascadeActor server-side (membership + mute + impersonation) at branch start — no branch inherits prior depth auth; max_turns + pause/hold re-checked per branch; caller identity from server session, never client-supplied actor id (forged cascadeActorId null per resolve-actor.test.ts pattern).

Owner: epic-group-chat.md (In Progress, frontend viewer Not Started). Verified: mention-parser PASS :162-166; turn-selector talkativity + mention boost + impersonated exclusion + mute; pass-filter; group-cascade (GroupCascadeOpts :22-37, mentions-win-else-advance, triggerGroupCascade :123, maxTurns chat.max_turns default 3, stop depth+1>=maxTurns :137-149, pause-watcher + isGenerationHeld, resolve-actor :94-132); post-store fire-and-forget :221-244; carry-history :72; error-only model/provider attribution. Absent: no parallel/judge/vote/synthesis (noise = negative); no mention-ui/turn-indicator/speaker-badge (negative).

Refs: debate https://arxiv.org/abs/2305.14325 (adapt propose-critique-revise + vote; personas natively heterogeneous); ChatEval https://arxiv.org/abs/2308.07201 (adapt critic/judge roles over shared candidates); cost of consensus https://arxiv.org/abs/2605.00914 (adapt as guardrail: heterogeneous + judge-gated or defer); AutoGen group chat https://microsoft.github.io/autogen/dev/user-guide/design-patterns/group-chat.html (adapt model-selected next speaker as selectNextGroupActor upgrade; keep round-robin/auto defaults); ReConcile https://aclanthology.org/2024.acl-long.381 (adapt confidence-weighted voting; confidence is the UI field).

Acceptance: default path byte-identical; K drafts + 1 judged message; PASS never drafted; pause aborts all branches; per-branch cost logged; per-test chat + K actors (seedChatWithActor-style, unique ids), parallel branches joined deterministically, afterEach DB close, no shared max_turns global, PASS/mute/pause cases isolated per test; judge-gating required (homogeneous drafts without judge = defer).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
