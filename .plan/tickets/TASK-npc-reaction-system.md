<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Npc Reaction System

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-npcs.md
**Tags:** npc, social
**Summary:** Perceived-event → reaction pipeline: focus selection, mode decision (via utility scorer), execution, episodic memory update. Feeds the daytime planning loop and the nightly reflection cycle.

**Context:** Reaction model in `src/characters/services/personality-service/utility-scorer.ts`; memory write path in `src/actors/actor-memories.ts`. Distinct from `TASK-npc-social-decision.md` (social-encounter gating) — this is the general event-reaction path.

**Acceptance Criteria:**

- [ ] Event → decision → execution → memory-update round trip tested (in-memory, no LLM).
- [ ] Interrupted plans route to `TASK-npc-plan-revision.md` (no silent drops).
- [ ] `bun run check` green.
