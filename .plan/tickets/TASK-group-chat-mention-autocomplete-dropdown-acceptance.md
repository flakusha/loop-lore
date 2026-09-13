<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Group chat: @mention autocomplete dropdown acceptance

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-group-chat.md

## Summary

UI implemented unticketed: chat-group.ts L4-108 (_mentionQuery/_mentionResults/handleMentionInput/selectMention), client-side substring match on _chatParticipants, no server-backed suggestions, no acceptance criteria. Backend routing done (TASK-group-chat-mention-routing Done; BUG prefix-collision resolved). Acceptance: dropdown keyboard nav + Esc; selection replaces token at cursor; empty-state; tests for multi-byte names; server-backed ranking deferred explicitly.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
