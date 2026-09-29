<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Agent Task Queue — Concurrency Caps + Worktree GC

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Type:** Feature Task / Infrastructure
**Tags:** agent, worktree, sandbox, gc, concurrency
**Epic:** epic-recursive-self-improvement

Bounded agent task queue (max concurrent worktrees, max disk, max patch size) plus 24h-idle worktree GC under `tree/agent-<uuid>/` — Part D sandbox limits made executable.

## Core Features

- `src/agent/api/queue.ts` — FIFO queue with caps: max N concurrent worktrees (config, default 4), max disk per worktree, max patch size per task (diff <= N KB); over-cap tasks wait with position surfaced, never silently dropped.
- `src/agent/api/gc.ts` — sweeps `tree/agent-<uuid>/` on finalize (immediate) or 24h idle; dry-run lists candidates; every collection lands in `agent_actions` (#9).
- Rate limit per token + global via `src/middleware/rate-limit.ts` (already referenced by epic).

## Acceptance Criteria

- [ ] 5th concurrent task queues (does not spawn 5th worktree) and starts when a slot frees
- [ ] Finalized worktree removed immediately; idle-24h worktree collected by GC cron
- [ ] Over-size patch rejected with cap cited before any disk write
- [ ] Unit tests for cap/queue ordering; integration test for GC idle + finalize paths

## Files

- `src/agent/api/queue.ts` — new
- `src/agent/api/gc.ts` — new
- `src/agent/api/queue.test.ts` — new
- `src/agent/api/sandbox.ts` — enforce caps (extends #6)
- `src/middleware/rate-limit.ts` — reuse (no new primitive)

## Notes / Verification

- Depends on #6 (worktree spawn + sandbox) and #9 (audit).
- Single FIFO + counters; skipped priority scheduler, add when FIFO measurably starves.


git issue: e621c9a
