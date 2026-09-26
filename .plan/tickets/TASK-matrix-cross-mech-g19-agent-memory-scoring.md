<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-matrix-cross-mech-g19: Agent-memory scoring (recency × importance × relevance + reflection)

**Status:** open
**Priority:** medium
**Effort:** Medium
**Type:** Task
**Summary:** Upgrade the memory purge/decay model toward a scored retrieval layer shared by every character-facing system: recency × importance × relevance with periodic reflection synthesis. Touches RPG, Social, Narrative, CharCore.
**Context:** `matrix-cross-mechanics.md` G19 is 🟡 Medium (future), P6+ deferred. Inspiration: generative-agents (Stanford), RisuAI HypaMemory, Kindroid. Existing tickets `TASK-agent-memory-scoring.md` and `TASK-memory-emotion-impact.md` cover pieces; this ticket closes the cross-system wiring so all character-facing systems query the same scorer.

## Current state

- `src/memory/` stores memories with `importance` field but no unified scorer.
- `src/social/`, `src/narrative/`, `src/actors/` each maintain their own relevance filter.
- Reflection synthesis (`TASK-agent-memory-scoring.md`) is local; no shared scoring contract.

**Acceptance Criteria:**

- [ ] `scoreMemory(memory, query, now)` in `src/memory/score.ts` returns `{ recency, importance, relevance, composite }`.
- [ ] RPG, Social, Narrative, CharCore all call `scoreMemory` through a single shared retriever; per-system filter logic preserved as a post-step.
- [ ] Reflection synthesis runs on a schedule (configurable; default nightly) and writes a `memory_reflection` row per active character.
- [ ] Tests in `src/memory/score.test.ts` pin the formula and ordering for the four callers.
- [ ] `bun run check` green.

**Tags:** memory, scoring, reflection, retrieval, P6+
**Related:** src/memory/, src/rpg/, src/social/, src/narrative/, src/actors/, .plan/matrix-cross-mechanics.md (G19 row), TASK-agent-memory-scoring.md, TASK-memory-emotion-impact.md

git issue: 3904a3d
