<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: C1: Moderation-action notices with actor thumb

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-chat-lifecycle-moderation
**Tags:** composition, matrix-c1

**Summary:**

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Summary:** A ban/mute/flag writes an in-app notification to the affected user carrying the acting-context 256px thumb reference. Today these acts are audit-row-only; the user sees nothing.
**Context:** Composes B7 (applyBan/Kick/Mute/Flag, src/chat/moderation.ts) + B1 (notifySystem, src/notifications/service/triggers.ts:165) + B4 (thumb serve, src/assets/variant-path.ts:24). Phase-1 slice: src/chat/moderation.ts post-apply notifySystem call + triggers.ts reuse (thumb as read-only reference, no assets change) + test. Score 4 (V3/E1/R1/U0), band next. Next-wave only, never the 0.1.0 tag; size-strict ceiling veto applies.
**Acceptance Criteria:** ban, mute and flag each emit notifySystem to the affected user; thumb attached as read-only reference with no assets-service change; tests pin the audit-plus-notify pair; bun run check green.
**Parents:** 02-#5 (FB12 role-change notify, same audit-only-to-notify pattern) x 03-X1 (thumb-only avatar habit, applied locally). 02x03 chain 1/3.
**Depends:** FB12 ticket (ADM-to-NTF admin actions notify affected users), filed in parallel by sibling agent fileA. Coordinate the notifySystem call shape; C1 extends the FB12 pattern to moderation actions.
**X-map:** 03-X1 is covered by this ticket; do NOT file X1 separately.
**Related:** FB9 gallery gates (thumb visibility filter consulted read-only for avatar-bearing payloads). Sibling C7 reuses this notifySystem shape -- land C1 first. Sibling C4 differs (remote-initiated verdicts, not admin-initiated).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
