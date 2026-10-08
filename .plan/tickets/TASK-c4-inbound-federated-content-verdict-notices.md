<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: C4: Inbound federated content verdict notices

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-instance-federation
**Tags:** composition, matrix-c4

**Summary:**

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Inbound mesh content run through the X6 moderation pipeline notifies the recipient (delivered, thumb attached) or mods (rejected plus counter) with identical error shapes regardless of rejecting layer -- no oracle for remote probers.
**Context:** Composes B5 (receiveDelivery, src/federation/delivery.ts:34) + B7 (applyFlag, src/chat/moderation.ts; assertNsfwCapability, src/nsfw/capability-gate.ts:96) + B1 (notifySystem) + B10 (gallery G6 visibility filter consulted read-only for avatar-bearing payloads). Phase-1 slice: delivery.ts verdict-to-notify call at the X6 call site + triggers.ts + test. Score 4 (V3/E2/R2/U1), band next. R=2 federationsurface. Next-wave only, never the 0.1.0 tag.
**Acceptance Criteria:** delivered inbound content notifies recipient with thumb; rejected content notifies mods with counter; error shapes identical across rejecting layers; gallery G6 filter consulted read-only for avatar payloads; bun run check green.
**Parents:** 02 candidates n/a standalone; 03-X6 (user-visible edge of the X6 moderation pipeline).
**Differs:** from 02-#5 FB12 (remote-initiated, not admin-initiated).
**X-map:** 03-X6 is covered by this ticket; do NOT file X6 separately.
**Related:** FB9 gallery gates (B10 read-only consultation). Siblings TASK-c1-moderation-action-notices-with-actor-thumb (admin-initiated counterpart) and TASK-c2-bridged-turn-skip-propagation-bridge-only.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
