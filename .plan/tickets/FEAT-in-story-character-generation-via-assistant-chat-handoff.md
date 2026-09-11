<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: In-story character generation via assistant chat handoff

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-assistant-gm-flows.md

## Summary

The RPG/story flow introduces new entities (characters, locations, items, quests, notes, ...) that were never generated. Enhance the chat/assistant/GM flow so story-introduced entities can be generated in place, reviewed, and approved before becoming full game assets (game assets are pre-reviewed by default logic approach).

**Unified mechanism, not character-specific:** the same in-place generation flow (detection -> assistant-chat handoff -> finalize -> review/approval) is functionally unified across entity kinds; characters are the lead case, locations/items/quests/notes reuse the identical logic with per-kind spec templates.

## Story-triggered flow

- Story development introduces new, non-generated character(s).
- Introduced characters may be generated in place: generation -> review -> approval.
- Ambient introduction is a valid no-op path: if no separate character is created, the story continues — no extra details or functionalities for the character.

## Frontend

- Button in the chat/group-chat surface to generate a partial or full character spec in place.
- Chosen approach (uses existing functionality): the button reroutes to a new assistant chat / group chat seeded with the initial character information gathered from the story; that chat finalizes the character spec and proceeds to review.
- Open decision — creation chat participant scope: GM only? GM + the user whose turn introduces the character? Wider? TBD.
- Rejected/deferred alternative: shadow flow / subchat — not implemented; risks conflicting with existing chat functionality, and an erroneous message send can spoil the chat.

## Related (same mechanism, per-kind instances / follow-ups)

- New location generation: location introduced by story development; new details added via fast edit/development/assistant flow.
- New game items, quests, notes/shadow notes, and other RPG assets generated in place.
- Tie-ins: intent detection, item tracking, note tracking, quest tracking, memory injection — these provide additional related context for in-place generation and can be updated by story progress.
- Opt-in chat carriage toml (receipt-style ledger) may partly resolve context retention until the full character/item/etc. spec is introduced, or just naturally retain context when no detailed generation is involved.

## Related tickets

- TASK-assistant-creative-studio-workflow-character.md — user-initiated studio workflow creation; this ticket covers story-triggered in-place generation feeding the same review gates.
- epic-gm-shadow-notes.md — shadow notes steering; subchat/shadow-flow alternative rejected here.

## Acceptance Criteria

- [ ] Story-triggered detection: an introduced, non-generated character can be handed off to in-place generation without breaking the running story (ambient introduction remains a valid no-op path).
- [ ] Frontend button reroutes to a new assistant chat/group chat seeded with the initial character info; finalized spec proceeds to review/approval before actor insert.
- [ ] Creation-chat participant scope decided and enforced (GM only vs GM + introducing user).
- [ ] Review/approval gate required before the character becomes a full game asset (aligns with epic quality gating).
- [ ] No regression to existing chat/group-chat message flows (assistant-chat handoff, not subchat).
- [ ] Unit/integration tests: handoff seeding, gate blocking dispatch without approval, participant scoping.
