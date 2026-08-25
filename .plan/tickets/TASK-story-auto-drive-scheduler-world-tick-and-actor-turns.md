# TASK: Story auto-drive scheduler world tick and actor turns

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

The autonomy loop: world-tick scheduler selecting due actors and dispatching their actions through the existing generation pipeline without a human driving each turn. Epic: epic-actor-autonomy-story-drive.md. Depends on TASK-autonomy-rate-governor-for-llm-actors.

## Current state

- NpcNavigationService (src/rpg/npc-navigation/) is tick-based but nothing drives ticks.
- GameMasterService generates only on user turns; GameMasterConfig.type llm/human/hybrid + actorModels per-actor routing exist.
- BDI planning/reaction tickets (epic-agency-story-points) are the decision layer — scheduler must accommodate them when they land, not wait for them.

## Direction

1. Tick source pluggable: real-time (background interval), accelerated (N game-hours per real minute), manual (advance-world affordance); per world/chat.
2. Due-actor selection each tick: BDI plan due, pending reaction, movement tick due, GM narrative beat due (LLM GM = governed actor consuming the same budget).
3. Dispatch through existing generation pipeline (story-mode/auto-gen path, group-cascade turn guards reused); results + episodic memory writes.
4. Human-in-loop: pause/resume/step-one-action at any moment; user messages always pre-empt autonomous turns.
5. Persistence: simulation state (tick cursor, actor queues, pending reactions) survives restart; crash recovery resumes without double-dispatch.
6. v1 autonomy vocabulary: move (navigation ticks), ambient action (from BDI plan or simple idle behaviors), initiate/react chat, GM beat. Exploration = movement + location-event reactions (epic-npc-navigation Dynamic Interaction).

## Acceptance

- [ ] All three tick sources verified; UI never blocks on the loop.
- [ ] Scheduler + governor integration: due actor without budget is skipped and rescheduled, not dropped.
- [ ] Restart mid-loop resumes exactly once per pending action (no double-dispatch, tested).
- [ ] Pause/resume/step verified end-to-end; user message pre-empts in-flight tick.
- [ ] LLM GM beats flow through the same governed dispatch as NPC actions.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
