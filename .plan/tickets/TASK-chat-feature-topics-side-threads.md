<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Topics — Side-Conversations Within a Chat

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** High
**Type:** Feature Ticket
**Tags:** chat, feature, topics, threads, context
**Epic:** epic-chat-product-features

## Summary

User-created sub-conversations (topics) scoped to a chat: spin an exchange off into a side thread — OOC planning, rules questions, character side-scene — without polluting the main timeline or its context budget. LobeChat ships per-assistant topics with topic-reference tooling; loop-lore's sectioning (`TASK-chat-sectioning-multi-location`) is location-driven and `TASK-chat-feature-message-edit-resubmit-branch` is history-forking, neither covers user-curated side threads (research 2026-09-11).

## Acceptance Criteria

- [ ] Any message can be moved or quoted into a topic; the main timeline shows a topic-reference chip
- [ ] Topics have their own context window; the main chat's budget is not consumed by topic content
- [ ] A topic can promote its conclusion back into the main timeline as a summary or full messages (user chooses)
- [ ] Turn rules and moderation hooks apply inside topics with the same participant roster
- [ ] Encrypted variants encrypt topic messages with the chat key; topics inherit membership-change key rotation
- [ ] Topic list is navigable from the chat header; topics are archived with the chat

## Related Epics / Tickets

- Parent: `epic-chat-product-features`
- `TASK-chat-sectioning-multi-location` — location-driven sections; orthogonal axis
- `TASK-chat-feature-message-edit-resubmit-branch` — history forking; different mechanism, shared tree UI
- `TASK-rpg-chat-questions` — OOC handling that topics can host
- `epic-message-seen-state` — read state per topic

## Files

- `src/chat/service/` — topic scoping + context-window partitioning
- `src/db/` — topic linkage on messages (no schema change assumed; verify against `epic-chat-lifecycle-moderation`)
- `src/components/chat/` — topic list, chips, promotion UI

## Research Inputs

- LobeChat topics + topic-reference tools (deepwiki lobehub/lobe-chat, 2026-09-11)

## Open Questions
- Do topics appear to all participants, or support private (per-user) topics?
- Can a topic itself spawn further topics, or is nesting capped at one level?
