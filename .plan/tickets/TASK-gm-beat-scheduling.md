<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: GM beat scheduling

**Status:** Done
**Priority:** high
**Effort:** Large (beat entry point + double-movement fix + chat/world resolution + governor gate)
**Summary:** Make the Game Master schedulable, so a world tick can produce narrative instead of only NPC movement. The GM is currently turn-driven: `GameMasterService.executeTurn` is driven only by `POST /api/chats/:id/story/step`.
**Context:** Split out of `TASK-story-auto-drive-scheduler`, whose dispatch AC required a GM beat target. `executeTurn` (`src/story/game-master/index.ts:126`) is chat-scoped and produces a turn, not a world-scoped beat; no unit in `src/` schedules a narrative beat for a world. Two blockers were found while scoping: **(1) double movement** — `executeTurn` already calls `processMovementTick` itself (`src/story/game-master/execute.ts:45`), so a tick calling both it and `runNpcMovementTick` would advance every NPC twice per pass; **(2) chat vs world** — `executeTurn` resolves its world from `state.chatId` (`execute.ts:22`), while the scheduler dispatches per world and only learns a chatId opportunistically, with no guarantee it has a GM config. GM roles are owned by `epic-assistant-gm-flows.md`.

**Acceptance Criteria:**
- [x] A GM beat can be dispatched on a schedule, not only via the HTTP route (`runGmBeat` in `src/story/game-master/beat.ts`, wrapped as the `gm` target by `createGmBeatDispatch` in `src/autonomy/dispatch/gm-beat-dispatch.ts`, registered on the production cron tick `autonomy.world-tick` in `src/cron/jobs.ts`).
- [x] The double-movement hazard is resolved — `executeTurn` takes `moveNpcs: false`, and the beat always passes it because the scheduler's movement target (registered first) already advanced the world this tick.
- [x] A regression test asserts that one tick advances each NPC exactly once, covering both dispatch paths (`src/story/game-master/beat.test.ts`: scheduler tick with both targets reports `dispatched: 2` with exactly one route step; `moveNpcs: false` leaves the NPC put; default still moves).
- [x] Chat-vs-world resolution is explicit: the world resolves to at most one story-mode chat (`created_at ASC, id ASC`, matching `SimulationStore.chatIdFor`); zero chats skips `gm_no_chat`, two or more skips `gm_chat_ambiguous`; a `human`-type GM skips `gm_requires_human`, never faked.
- [x] Governor-gated: an LLM-backed beat respects the autonomy budget like every other dispatch (one `per_hour_beat_dispatch` charge on the world scope with `perUserCap` before the beat; denial reports `gm_budget`; `disabled` re-checked per target; tick-shared-stream jitter `gm_jitter` before the charge so a dropped beat spends nothing). Story stop controls are honoured post-`initialize` (`gm_paused` / `gm_story_complete` from `story_state` / `max_turns`); group-cascade `max_turns` / `auto_advance` admission stays chat-scoped and is never driven by a world beat.
- [x] Target-level gating tests cover every skip (`disabled`, `gm_jitter`, `gm_budget`, all five `runGmBeat` misses) plus a scheduler test proving a GM skip still leaves movement dispatched; pause/resume/step cover the beat via the shared `tickWorld` path (documented on `autonomyControl`).
- [x] `bun run check` green (verified by the orchestrator at phase end; per-suite `bun test` green on the touched suites).

**Epic:** epic-actor-autonomy-story-drive
**Tags:** autonomy, gm, story-drive, scheduler, narrative
**Related:** TASK-story-auto-drive-scheduler, epic-assistant-gm-flows, epic-actor-autonomy-story-drive.md:110-121

git issue: 0361710

**Resolved:** 2026-10-02 registry-driven close: git issue 0361710 (registry tip: d1b6edaab Konstantin Fedotov Auto-closed: appended .md marker marks TASK-GM-BEAT-SCHEDULING done)
