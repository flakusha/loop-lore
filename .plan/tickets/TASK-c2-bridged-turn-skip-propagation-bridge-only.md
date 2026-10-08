<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: C2: Bridged turn-skip propagation (bridge-only)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-group-chat
**Tags:** composition, matrix-c2

**Summary:**

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Summary:** A local turn skip emits the 02-#9 hook; the bridge consumes it and suppresses the skipped actor's next bridged turn (no ghost turns); inbound bridge skips map to recordTurnSkip. Tag rides a sidecar map in src/integrations/ until the MessageKind column lands.
**Context:** Composes B2 (recordTurnSkip, src/chat/service/crud/turn-skip.ts:84) + B6 (receive, src/integrations/bridge.ts:178; selectNextGroupActor) + B9 (turn_skip content_type). Phase-1 slice: turn-skip.ts hook emit (02-#9) + bridge.ts skip propagation at receive/send + test. Label per R03 review: bridge-only, not group-chat-only. Score 4 (V2/E1/R1/U1), band next. Next-wave only, never the 0.1.0 tag; C2 unblocks X2 stamp-second/gate-third steps.
**Acceptance Criteria:** local skip emits 02-#9 hook; bridge suppresses skipped actor's next bridged turn; inbound bridge skips persist via recordTurnSkip; sidecar tag map used until MessageKind column lands; bun run check green.
**Parents:** 02-#9 (SC turn.skipped hook) x 03-X2 (bridged kind stamping). 02x03 chain 2/3.
**Depends:** turn.skipped hook ticket (fileA parallel filing #10a) -- the hook emit is 02-#9; land the hook first, this ticket consumes it.
**X-map:** 03-X2 is covered by this ticket (tag-first step); do NOT file X2 separately. Full kind=actor_action stamping waits on the separation epic MessageKind column.
**Related:** Sibling C1 ticket TASK-c1-moderation-action-notices-with-actor-thumb; sibling C5 chain 3/3 builds on this plus 02-#9.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
