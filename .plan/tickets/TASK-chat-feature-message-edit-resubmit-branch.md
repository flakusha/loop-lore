<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Message Edit & Resubmit with Branching

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Medium
**Effort:** High
**Type:** Feature Ticket
**Tags:** chat, feature, edit, branching, history
**Epic:** epic-chat-product-features

## Summary

Edit any prior message and resubmit from that point, creating a new branch of the conversation instead of mutating history. LibreChat's edit/resubmit (`EditMessage.tsx` `resubmitMessage`, fork options `DIRECT_PATH` / `INCLUDE_BRANCHES` / `TARGET_LEVEL`) is the reference implementation; loop-lore has chat-level branch/merge (`TASK-chat-branch-merge`) but no message-level edit-resubmit flow (research 2026-09-11).

## Acceptance Criteria

- [ ] Editing a sent message and resubmitting forks the conversation at that message; the original branch is preserved and reachable
- [ ] Regenerating a mid-history message also forks rather than destroying downstream messages
- [ ] Branch picker lets the user switch between sibling branches without data loss
- [ ] Edited messages carry an edited marker; branch point is navigable via `TASK-chat-feature-rpg-chronological-navigation` tree edges
- [ ] Encrypted variants re-encrypt only the forked branch's new messages
- [ ] Moderation/audit trail records fork events (who forked from where)

## Related Epics / Tickets

- Parent: `epic-chat-product-features`
- `TASK-chat-branch-merge` — chat-level branch machinery
- `TASK-chat-feature-rpg-chronological-navigation` — tree navigation UI
- `TASK-chat-feature-component-buttons` — edit/regenerate entry points in the action row

## Files

- `src/chat/service/` — message mutation + fork write path
- `src/chat/transitions.ts` — branch-edge recording
- `src/components/chat/` — edit UI + branch picker

## Research Inputs

- LibreChat message branching & fork options (deepwiki danny-avila/LibreChat, 2026-09-11)
- SillyTavern checkpoints/branch-from-message (deepwiki SillyTavern/SillyTavern, 2026-09-11)

## Open Questions

- Do shared memories reference-attach to both branches or clone on fork?
- Is there a per-chat branch-count cap for storage policy?
