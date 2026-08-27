# TASK: Autonomy rate governor for LLM actors

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-actor-autonomy-story-drive.md

## Summary

Highest-priority governance layer for autonomous character/NPC/GM actions: no autonomous LLM call may ship ungoverned. Epic: epic-actor-autonomy-story-drive.md.

## Current state

- Group-chat cascade max-turns/consecutive-turn guards are the only existing auto-drive capping (chat-scoped only).
- Auth rate limiters are HTTP-transport-level; nothing budgets LLM actions.
- NpcNavigationService tick processing has no caller and no budget.

## Direction

1. Governor service consulted before every autonomous action dispatch; denial is default; autonomy is opt-in per world/chat.
2. Budgets: per-actor actions/hour, per-world/chat actions/hour, token + cost caps per window. In-flight bound rides the route-level concurrency semaphore (FEAT-generation-rate-limiting-and-concurrency-limits); the governor adds actor-level quotas above it, not a second semaphore.
3. Cooldowns with mandatory jitter (configurable spread ratio) — fixed intervals read robotic; jitter is part of pseudoorganic pacing, not optional polish.
4. Kill switch: per-world scope is autonomy-native; global + per-chat holds are CONSUMED from generation flow control (FEAT-global-generation-pause-kill-switch system_config key + story_state.isPaused) — no parallel pause machinery. Takes effect between actions, aborts queued dispatches.
5. Cost accounting: every autonomous generation logged per actor (tokens, model, est. cost) — surfaces in health/telemetry.
6. Unlimited mode ONLY behind explicit dev/stress flag (config-gated, refused in production builds); when on, every action still cost-logged.

## Acceptance

- [ ] Ungoverned dispatch path is impossible: generation pipeline rejects autonomous actions lacking governor grant (tested).
- [ ] Budget exhaustion denies gracefully (actor idles, no error spam); partial-window refill verified.
- [ ] Jitter spread verified statistically in tests; zero-jitter only via explicit config.
- [ ] Kill switch stops mid-loop within one action; unlimited mode refused without dev flag.
- [ ] Cost ledger queryable per actor/world/window.

