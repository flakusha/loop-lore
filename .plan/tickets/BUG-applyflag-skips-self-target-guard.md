<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: applyFlag skips self-target guard

**Status:** Done
**Status Note:** stale-resolved (verified 2026-10-25) — applyFlag (src/chat/moderation.ts:537-539) now opens with the same self-target guard as applyBan/applyKick/applyMute: `if (opts.targetActorId === opts.byActorId) return { ok: false, reason: "Cannot apply moderation action to yourself" }`.
**Priority:** low
**Effort:** Medium
**Epic:** epic-chat-lifecycle-moderation

**Summary:**

applyFlag (src/chat/moderation.ts:529-536) has no self-target guard, unlike applyBan, applyKick, and applyMute which all check if (opts.targetActorId === opts.byActorId). Impact: Self-flagging creates noise in the moderation audit trail. Fix: Add the same guard at the top of applyFlag.

**Context:**

Closure rationale (verified 2026-10-25 against the current implementation): applyFlag (src/chat/moderation.ts:537-539) now opens with the same self-target guard as applyBan/applyKick/applyMute: `if (opts.targetActorId === opts.byActorId) return { ok: false, reason: "Cannot apply moderation action to yourself" }`.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue af59426 (registry tip: 69a86282e Konstantin Fedotov Close issue)
