<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NPC BDI Planning Loop

**Status:** Done
**Priority:** Medium (P6+ deferred)
**Effort:** High
**Epic:** epic-agency-story-points, NPC/Actor System
**Summary:** Umbrella sketch for the BDI goal-pursuit loop — superseded by slice tickets plus the shipped reflection cycle. No independent implementation scope remains.

**Context:** Slices now tracked separately: `TASK-npc-planning-loop.md` (daytime planning pass), `TASK-npc-reaction-system.md` (event perception + reaction), `TASK-npc-plan-revision.md` (dynamic revision), `TASK-npc-chat-buffer.md` (cooldown/buffer). Tables shipped (migration 011); nightly cycle in `src/services/agency/bdi-nightly.ts`; reflection checkpoints in `TASK-agency-bdi-reflection-cycle.md`. This umbrella stays as design reference only.

**Acceptance Criteria:**

- [x] Closed as superseded; slice tickets + reflection-cycle carry the work.

## Resolution

Superseded — verified 2026-09-26. Design reference retained above; implementation tracked in the four slice tickets and `TASK-agency-bdi-reflection-cycle.md`.
