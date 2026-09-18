<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG Mode — Chronological / Tree Navigation Between Chats

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

In RPG mode, when chats split, merge, or transition, provide explicit navigation controls (buttons / dropdowns) that move the participant along chronologically-ordered or tree-structured chat connections. The graph and its edges are derived from `src/chat/service/split.ts` and `src/chat/transitions.ts`.

## Acceptance Criteria

- [ ] RPG-mode world opt-in is a hard prerequisite (`TASK-rpg-gate-chat-commands-behind-world-opt-in`)
- [ ] Chat header exposes navigation buttons / dropdowns for prior, next, parent, and child chats
- [ ] Chronological ordering is derived from chat creation + transition timestamps
- [ ] Tree edges come from `src/chat/service/split.ts` (split) and `src/chat/service/carry-history.ts` (merge)
- [ ] Navigation works even when the destination chat is in a different location / world
- [ ] Keyboard shortcuts (e.g. alt-left / alt-right) traverse chronology

## Related Tickets / Epics

- epic-chat-product-features
- epic-rpg-wiring-phase3
- TASK-chat-flow-section-navigation
- TASK-chat-branch-merge
- TASK-chat-only-world-channels-invite-driven-membership
- TASK-rpg-gate-chat-commands-behind-world-opt-in

## Files

- `src/chat/service/split.ts`
- `src/chat/service/split-utils.ts`
- `src/chat/service/carry-history.ts`
- `src/chat/transitions.ts`

## Open Questions

- Does the navigator show only chats the actor participated in, or the full graph?
- How deep can the tree grow before we collapse it into a "show more" affordance?

