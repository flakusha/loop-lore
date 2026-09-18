<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Flashback Roleplay Chat With Memory Propagation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-memory-knowledge-systems
**Tags:** memory, flashback, timeline

**Summary:**
Create a flashback chat that re-plays a chronologically-past encounter as a new chat, populating it via memory pointers (no backfill of existing chats/stories/locations/world events).

**Context:**
Players often want to "go back in time" to roleplay an event they only heard about ("I saw this in the tavern later, what happened?"). The flashback chat must start fresh; its content comes ONLY from memories (compact event descriptions with pointer chains), never from rewriting existing chat history.

**Acceptance Criteria:**
- New chat mode `kind = "flashback"` with `derivedFromMemoryIds: string[]`.
- Composer pulls each memory pointer, dereferences to source message range (using `TASK-memory-compact-pointer-to-message-chain`).
- Replay policy: backlog shows ONLY messages covered by the memory source range, in chronological order. NO backfill to other chats/locations/world.
- Memory propagation rule: memories created in flashback chats DO propagate to future chats per `epic-memory-propagation`, but do NOT mutate pre-existing timeline.
- Replay prohibition per `TASK-time-sync-replay-prohibition-policy`.
- Tests: flashback creates chat; existing chat unchanged; future chats receive propagated memories.
