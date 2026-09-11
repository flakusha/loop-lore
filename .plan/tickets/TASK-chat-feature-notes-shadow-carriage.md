<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: GM Notes, Shadow Notes, Quests, Dev-Visible Carriage

**Status:** ⬜ Not Started
**Priority:** Low
**Effort:** Medium
**Epic:** epic-chat-product-features

## Summary

Provide three GM-tier annotation surfaces inside a chat: public notes, shadow notes (visible only to GM / designated observers), and quests. Add a dev-visible "carriage" channel for cross-context state carried between sections, parties, and sessions, never surfacing to end users.

## Acceptance Criteria

- [ ] `note` / `shadow_note` / `quest` annotations persist per chat with proper shareability controls
- [ ] Shadow notes are excluded from non-GM views at every render site
- [ ] Carriage record is visible to admins and developers but never to regular participants
- [ ] Annotations propagate under the existing context window and memory-shareability rules
- [ ] Quest state transitions (open / completed / failed) emit memory events
- [ ] `src/memory/shareability.ts` correctly gates shadow notes out of shared recall

## Related Tickets / Epics

- epic-chat-product-features
- epic-gm-shadow-notes
- TASK-gm-whitenotes
- TASK-gm-shadow-notes

## Files

- `src/chat/proactive/types.ts`
- `src/chat/proactive/db-helpers.ts`
- `src/chat/service/carry-history.ts`
- `src/chat/service/party-narration.ts`
- `src/memory/shareability.ts`

## Open Questions

- Does carriage carry across chat transitions, or only across section splits within a chat?
- Should shadow notes be exportable by GM as a transcript?

