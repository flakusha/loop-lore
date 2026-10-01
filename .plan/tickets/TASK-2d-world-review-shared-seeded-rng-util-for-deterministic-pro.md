<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: 2D world review: shared seeded-RNG util for deterministic procgen

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-2d-sprite-world.md
**Tags:** 2d-world, review
**Summary:** Shared seeded-RNG util (mulberry32 + string hash) with tests.
**Context:** epic-2d-sprite-world procgen; random-events.ts uses Math.random.
**Acceptance Criteria:** Same seed reproduces; random-events accepts injected RNG.

## Summary

Epic epic-2d-sprite-world assumes a seeded deterministic pass for procgen, but no seeded RNG exists in src (no mulberry32/splitmix/xorshift/LCG; src/chat/random-events.ts uses Math.random at lines 125,191). Add a small shared util (e.g. src/utils/seeded-rng.ts, mulberry32 + string-seed hash) with tests. Acceptance: same seed reproduces sequence; random-events accepts optional injected RNG; FEAT-2d-world-seeded-procgen consumes it. Note: TASK-replayability-session-seeded-random-tables is session tables (migration 035), not a code util - no overlap.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
