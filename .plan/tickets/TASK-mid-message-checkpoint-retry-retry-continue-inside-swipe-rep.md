<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Mid-message checkpoint retry (retry-continue) inside swipe replay branch

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Context

Explicit sub-item of FEAT-MESSAGE-SWIPE-REPLAY-BRANCH (b619680, Not Started) — do not supersede that issue; this ticket owns only the intra-message checkpoint delta. ST Retry-Continue sets a checkpoint *inside* a long message and regenerates only from that point. Today loop-lore has whole-message regenerate with intent variants (`src/assistant/commands/regen.ts:17`), turn-level continue without breaking story (epic-actor-turn-skip.md, Done), message-level swipes (`swipe_index`, `src/assistant/commands/link.test.ts:64`), and planned whole-message replay/branch (b619680). `giwt search "retry continue"` -> no matches: mid-message checkpoints are uncovered.

Epic: none (sub-item of the swipe/replay FEAT).

## Summary

Streaming is already chunked (`src/regex/html-sanitize-streaming.ts`), so a byte-offset checkpoint is expressible: user marks a position inside an assistant message; regeneration continues from that offset, replacing only the tail. Prompt truncation, idempotency and retry plumbing (`fda0bfe`, `61bec9a` swipe-race work) make this fiddly — sequence after b619680 lands.

## Acceptance Criteria

- [ ] User can set a checkpoint inside an assistant message and regenerate only the tail after it.
- [ ] Message history, swipe_index and timeline state remain consistent (tail replacement is recorded, not a new message row).
- [ ] Idempotency/retry of the partial regeneration does not duplicate content (follows the swipe-race fixes).
- [ ] Fixtures: checkpoint + regen; checkpoint near message start/end; concurrent swipe during regen.

## Caveats

- [ ] Data races: partial-regen writes must respect the swipe-index unique constraint (precedent 61bec9a).
- [ ] Rollback: failed partial regen leaves the original message intact.
- [ ] Observability: partial-regen attempts logged with byte offsets.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
