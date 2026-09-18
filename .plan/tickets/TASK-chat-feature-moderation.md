<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Moderation — Ban, Kick, Mute, NSFW & Non-NSFW Point Flags

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-chat-product-features

## Summary

Complete the moderation surface across chat scope: ban (full removal), kick (immediate removal with rejoinable history), mute (silence output and/or input), and NSFW / non-NSFW point flags that escalate into the audit pipeline. Each action must write an audit trail and respect consent / NSFW gate rules.

## Acceptance Criteria

- [ ] Ban removes participation and prevents rejoin for the configured scope
- [ ] Kick removes the actor immediately but leaves history intact and rejoinable
- [ ] Mute suppresses both inbound and outbound traffic for the muted actor
- [ ] NSFW point flag triggers `src/generation/hooks/moderation-hook.ts` and writes to the audit ledger
- [ ] Non-NSFW point flag (e.g. toxicity, off-topic) flows the same audit path with the appropriate severity tag
- [ ] All four actions are admin/owner gated via `src/middleware/permissions.ts`
- [ ] Audit trail is queryable for compliance via `src/middleware/nsfw-gate/logging.ts`

## Related Tickets / Epics

- epic-chat-product-features
- epic-chat-lifecycle-moderation
- TASK-nsfw-moderation-delete-audit-regression-verify
- TASK-moderation-actions-frontend
- TASK-nsfw-gate-moderation-events

## Files

- `src/chat/moderation.ts`
- `src/chat/types/moderation.ts`
- `src/middleware/nsfw-gate/access.ts`
- `src/middleware/nsfw-gate/consent.ts`
- `src/middleware/nsfw-gate/logging.ts`
- `src/generation/hooks/moderation-hook.ts`
- `src/profanity/service.ts`

## Open Questions

- Does mute affect only the active chat, or all chats the actor shares with the muter?
- Are NSFW / non-NSFW point flags discrete counters, or a unified severity rubric?

