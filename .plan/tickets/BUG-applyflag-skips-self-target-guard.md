<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: applyFlag skips self-target guard

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

applyFlag (src/chat/moderation.ts:529-536) has no self-target guard, unlike applyBan, applyKick, and applyMute which all check if (opts.targetActorId === opts.byActorId). Impact: Self-flagging creates noise in the moderation audit trail. Fix: Add the same guard at the top of applyFlag.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
