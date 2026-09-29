<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: GM beat scheduling

**Status:** Not Started
**Priority:** high
**Effort:** Large (beat entry point + double-movement fix + chat/world resolution + governor gate)
**Summary:** Make the Game Master schedulable, so a world tick can produce narrative instead of only NPC movement. The GM is currently turn-driven: `GameMasterService.executeTurn` is driven only by `POST /api/chats/:id/story/step`.
**Context:** Split out of `TASK-story-auto-drive-scheduler`, whose dispatch AC required a GM beat target. `executeTurn` (`src/story/game-master/index.ts:126`) is chat-scoped and produces a turn, not a world-scoped beat; no unit in `src/` schedules a narrative beat for a world. Two blockers were found while scoping: **(1) double movement** — `executeTurn` already calls `processMovementTick` itself (`src/story/game-master/execute.ts:45`), so a tick calling both it and `runNpcMovementTick` would advance every NPC twice per pass; **(2) chat vs world** — `executeTurn` resolves its world from `state.chatId` (`execute.ts:22`), while the scheduler dispatches per world and only learns a chatId opportunistically, with no guarantee it has a GM config. GM roles are owned by `epic-assistant-gm-flows.md`.

**Acceptance Criteria:**
- [ ] A GM beat can be dispatched on a schedule, not only via the HTTP route.
- [ ] The double-movement hazard is resolved — either the movement tick is extracted from `executeTurn` behind a flag, or the scheduler skips movement when dispatching a GM turn.
- [ ] A regression test asserts that one tick advances each NPC exactly once, covering both dispatch paths.
- [ ] Chat-vs-world resolution is explicit: either the beat targets a specific chat, or a world resolves to exactly one GM-capable chat with the miss case defined.
- [ ] Governor-gated: an LLM-backed beat respects the autonomy budget like every other dispatch.
- [ ] `bun run check` green.

**Epic:** epic-actor-autonomy-story-drive
**Tags:** autonomy, gm, story-drive, scheduler, narrative
**Related:** TASK-story-auto-drive-scheduler, epic-assistant-gm-flows, epic-actor-autonomy-story-drive.md:110-121

git issue: 0361710
