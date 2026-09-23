<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Memory Knowledge Isolation & World Timeline

**Ticket:** IDEA-memory-knowledge-isolation
**Date:** 2026-09-23 · **Status:** 🟡 Research published — TASK breakdown proposed
**Owner:** epic-memory-systems + epic-world-locations

---

## 1. Problem statement

Loop-lore's three-tier memory system (`FEAT-memory-systems-three-tier.md`) already
wires episodic/semantic/procedural memories into LLM context. The
`shareability.ts` module evaluates *whether a memory should leak between
characters* via `evaluateShareability`, and the injection decision runs
through `shouldInjectMemory` (`src/memory/injection/decide.ts`).

What is missing is a **per-viewer audit + world-timeline anchor** for that
isolation. Two concrete gaps:

1. **Per-viewer actor** — `shouldInjectMemory` is invoked without an explicit
   viewer argument. In a group chat, this means a memory that should be visible
   only to character A is potentially injectable into character B's context
   unless every caller passes `viewerId` explicitly.
2. **World-timeline versioning** — Memory entries reference world-state facts
   (a kingdom fell, a city burned, an NPC died) but the memory has no link
   back to the timeline event that *caused* it. Re-running a memory after a
   timeline rewind (e.g. `TASK-world-time-sync-wait-and-chat-branch-merge.md`)
   produces a stale fact that contradicts current world state.

Reference: `FEAT-memory-systems-three-tier.md` L64–66 already names this gap
("verify group-chat injection passes a per-viewer actor into
`evaluateShareability`/`shouldInjectMemory` so knowledge isolation (e.g.
dark-elves know, humans don't) holds per-message").

---

## 2. Current code surface (audit)

| File / Symbol                                  | Status     | Notes |
|-----------------------------------------------|------------|-------|
| `src/db/enums-story/world.ts` `MemoryType`    | ✅ shipped | episodic/semantic/procedural + shareability flags |
| `src/memory/provision.ts` `provisionMemories` | ✅ shipped  | single-character scope by default |
| `src/chat/context-window.ts` `injectMemories` | ✅ shipped  | **missing explicit `viewerId` arg in group-chat paths** (injection decision: `src/memory/injection/decide.ts` `shouldInjectMemory`) |
| `src/memory/shareability.ts` `evaluateShareability` | ✅ shipped | pure function, expects viewer ctx — caller discipline enforced (no compile-time guarantee) |
| `src/memory/extraction.ts`                    | ✅ shipped  | reads from message context |
| `src/memory/purge.ts`                         | ✅ shipped  | per-character TTL |
| `src/memory/budget.ts`                        | ✅ shipped  | token budget per tier |
| `src/story/timeline/world-timeline.ts`        | 🟡 partial | world event log; not linked from memories |
| `src/locations/`                                | 🟡 partial | location state machine; reference for memory scope |

**Audit conclusion:** the *primitives* exist (`shareability.ts`,
`story/timeline/world-timeline.ts`). The *wiring contract* is fragile because the
shareability check is enforced by caller discipline, not by an injected
viewer-id parameter. Five TASKs are listed below to make the contract
explicit.

---

## 3. Proposed TASK breakdown

### TASK-MEM-01: Enforce viewer-id contract in memory injection

**Goal:** make `shouldInjectMemory` / `evaluateShareability` callsite-fail
without an explicit `viewerId` argument.

- Change `injectMemories` signature to require `viewerId: string`.
- Update every caller (estimated 6–9: assistant chat, group chat, NPC chat,
  summarizer, audit log, memory replay).
- Add a unit-test gate: any caller omitting `viewerId` is rejected at type-check.

**Estimate:** M · **Owner:** memory-systems epic

### TASK-MEM-02: Audit isolation for known information-asymmetry cases

**Goal:** prove the per-viewer isolation holds for the cases users notice
most.

- Dark-elves vs. humans (named in ticket).
- Secret NPC-to-NPC knowledge from `TASK-npc-to-npc-social.md`.
- Cross-faction lore from `TASK-faction-relations-list-and-standing.md`.
- Each case: a regression test that mounts two viewers and asserts which
  memories are visible to which.

**Estimate:** M · **Owner:** memory-systems + world-locations epics

### TASK-MEM-03: Link memories to world-timeline events

**Goal:** add a `world_event_id` foreign key from memory rows to
`src/story/timeline/world-timeline.ts` entries.

- Migration: nullable column on memory table; back-fill from heuristics for
  recent memories.
- `provisionMemories` accepts an optional `worldEventId`; system callers wire
  it from chat-event listeners.
- A timeline rewind (see `TASK-world-time-sync-wait-and-chat-branch-merge.md`)
  invalidates all memories linked to events that no longer happened.

**Estimate:** L · **Owner:** world-locations + memory-systems epics

### TASK-MEM-04: Memory snapshot/restore with world-state version

**Goal:** bind a memory to a `world_version` snapshot so branched chat
sessions (TASK-world-state-management.md) don't leak across realities.

- `memory.world_version: int` column.
- `injectMemories` filters by `world_version <= viewer.world_version`.
- Migration to add the column; back-fill with the current head version.

**Estimate:** M · **Owner:** memory-systems epic

### TASK-MEM-05: NPC-boss retinue lore-access gating test

**Goal:** extend the audit (TASK-MEM-02) with the retinue-knowledge case
from `TASK-npc-boss-retinue-lore-and-relationship-service.md` —
lieutenants know things the boss knows; outsiders do not.

- Unit test fixture for a 3-NPC retinue graph.
- Asserts that a lieutenants-only memory is injected for lieutenants and
  rejected for outsiders.

**Estimate:** S · **Owner:** npc-systems epic

### TASK-MEM-06: Visibility report for chat admins

**Goal:** give chat admins a `/api/chats/:id/memory/visibility` endpoint that
returns the per-viewer memory-injection list for the latest message, with
the rejected memories shown for transparency.

- Reuses the `shouldInjectMemory` logic in read-only mode.
- Powers a future admin debug panel; out-of-scope for this IDEA to ship
  the UI.

**Estimate:** M · **Owner:** memory-systems + admin-tools epics

### TASK-MEM-07: Document isolation contract in `docs/spec/memory.md`

**Goal:** capture the rule in prose so any new caller can read it.

- Update `docs/spec/memory.md` (or create) with the explicit
  "viewer-id is mandatory" rule and the world-timeline contract.
- Cross-link from `FEAT-memory-systems-three-tier.md` so the rule is
  discoverable.

**Estimate:** S · **Owner:** memory-systems epic

---

## 4. Acceptance criteria for closing this IDEA

- [ ] `shouldInjectMemory` is called with an explicit `viewerId` from every
      callsite (TASK-MEM-01).
- [ ] Per-viewer isolation is verified for at least 4 asymmetric cases
      (TASK-MEM-02).
- [ ] Memories reference world-timeline events (TASK-MEM-03).
- [ ] World-state branch isolation (TASK-MEM-04).
- [ ] NPC-boss retinue case audited (TASK-MEM-05).
- [ ] Admin visibility endpoint (TASK-MEM-06).
- [ ] Isolation contract documented (TASK-MEM-07).

---

## 5. References

- `src/memory/shareability.ts` — `evaluateShareability`
- `src/memory/injection/decide.ts` — `shouldInjectMemory`
- `src/chat/context-window.ts` — `injectMemories`
- `src/story/timeline/world-timeline.ts` — world event log
- `src/locations/` — location state
- `.plan/tickets/FEAT-memory-systems-three-tier.md` — parent epic
- `.plan/tickets/TASK-world-time-sync-wait-and-chat-branch-merge.md` —
  timeline rewind use case
- `.plan/tickets/TASK-world-state-management.md` — branched world states
- `.plan/tickets/TASK-npc-boss-retinue-lore-and-relationship-service.md` —
  retinue-knowledge case
- `.plan/tickets/TASK-npc-to-npc-social.md` — NPC-to-NPC knowledge isolation
- `.plan/tickets/TASK-faction-relations-list-and-standing.md` — cross-faction lore
