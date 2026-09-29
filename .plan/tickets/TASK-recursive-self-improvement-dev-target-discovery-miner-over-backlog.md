<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Dev-Target Discovery Miner over Backlog

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Task / Automation
**Tags:** agent, backlog, discovery, rsi, automation
**Epic:** epic-recursive-self-improvement

Automated dev-target discovery: miner scores `.plan/backlog/` tasks for RSI-suitability (self-contained, testable, small blast radius) and surfaces a ranked queue the agent loop pulls from — closes the loop's input side (agent always has a next safe task).

## Core Features

- `scripts/rsi-target-miner.ts` — scores each backlog task on: self-containment (touches <=3 files), testability (has or admits a repro), size (effort <= Medium), safety (no migrations/secrets/auth changes without flag); outputs ranked JSON + markdown report.
- Feeds agent task queue (ticket-ops open / task queue): top-ranked tasks auto-filed as agent tasks when queue drains; human can pin/skip.
- Weekly refresh alongside failure-cluster miner (#20); excludes in-flight and blocked tasks.

## Acceptance Criteria

- [ ] Miner scores real `.plan/backlog/` and top-5 are manually judged RSI-suitable on spot check
- [ ] Unsafe tasks (migrations, auth, secrets) never auto-filed; flagged for human instead
- [ ] Queue integration: drained queue pulls next miner-ranked task without human step
- [ ] Unit tests for scoring weights; golden test on fixture backlog

## Files

- `scripts/rsi-target-miner.ts` — new
- `scripts/rsi-target-miner.test.ts` — new
- `.plan/backlog/` — read-only input (never writes back)
- `src/agent/api/tickets.ts` — consume ranked targets (extends ticket-ops)

## Notes / Verification

- Depends on #20 (shared weekly cadence) and agent ticket-ops (filing path).
- Heuristic weights in one config block; skipped ML ranker, add when heuristics measurably misrank.


git issue: 679d44b
