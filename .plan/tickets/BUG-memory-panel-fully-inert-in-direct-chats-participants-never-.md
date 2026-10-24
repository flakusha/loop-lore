<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Memory panel fully inert in direct chats — participants never loaded

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: In direct chats the memory panel is completely inert: loadMemories() and createMemory() early-return because the character actor id cannot be resolved.

ROOT CAUSE: loadParticipants() is only called on the group-chat load path (src/frontend/alpine/chat/world.ts:190), so in direct chats chat_participants is never fetched, `_getCharacterActorId()` returns null, and both loadMemories and createMemory bail out.

EVIDENCE: Probe STATE in a direct chat: {"participants":[],"charId":null,"characterMemories":[],"activeTab":"character"} — versus participants populated in group chats.

FIX DIRECTION: Load chat_participants on direct-chat open as well, so `_getCharacterActorId` resolves and the panel works in direct chats.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
