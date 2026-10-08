<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: C6: Outfit-gate verdict notices with avatar refresh

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-wardrobe-avatar-variants
**Tags:** composition, matrix-c6

**Summary:**

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Summary:** hard-block verdict renders a system notice to the requester (current outfit avatar attached) instead of a silent no-rebind; allow verdict rebinds plus loadEmotionAvatars refresh so no stale face.
**Context:** Composes B3 (requestOutfitChange verdicts, src/characters/services/wardrobe/change-gate.ts) + B1 (notifySystem) + B12 (avatarForMessage cache, src/frontend/alpine/mood/avatars.ts) + B4 (rebound thumb). Phase-1 slice: src/routes/wardrobe-overrides.ts verdict-to-notice at the existing hook seam + triggers.ts + test. Score 2 (V2/E1/R1/U0), band next; S filler. Next-wave only, never the 0.1.0 tag.
**Acceptance Criteria:** hard-block emits system notice with current-outfit avatar attached; allow rebinds and refreshes avatar cache; no stale face after verdict; bun run check green.
**Parents:** 03-X4 (user-visible edge of gate verdicts).
**Differs:** from 02-#6 (AV1 cache-bust on regen -- same refresh primitive, different trigger).
**X-map:** 03-X4 is covered by this ticket; do NOT file X4 separately.
**Related:** Siblings TASK-c1-moderation-action-notices-with-actor-thumb, TASK-c2-bridged-turn-skip-propagation-bridge-only, TASK-c4-inbound-federated-content-verdict-notices, TASK-c3-quiet-hours-aware-federated-world-event-notices, TASK-c7-throttled-login-plus-role-change-security-digest.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
