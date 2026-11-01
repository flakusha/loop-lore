<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Swipe preference-pair extraction (DPO groundwork)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-swipe-preference-pairs
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Context

First ticket of epic-swipe-preference-pairs.md (epic-lite). The DPO export is specified (buildDPO from reactions/model_comparisons in 64d38ce) but those are sparse signals. The dense one the product already produces is swiping: for every assistant message, `swipe_index` (`src/db/schema-core.ts:809`) + `parent_id` (:787) + `generation_attempts` (`src/db/schema-generation.ts` model_id :21, repetition_score :37) identify kept-vs-discarded sibling completions — natural chosen/rejected pairs with quality telemetry, currently captured by nothing. Coverage: `giwt search swipe` -> 23 hits, races/UX/mobile only; FEAT-MESSAGE-SWIPE-REPLAY-BRANCH (b619680) is regenerate/retry UX, not data capture; FEAT-060 model-comparison A/B is dashboard UX.

## Summary

Extractor over messages with `swipe_index > 1`: chosen = delivered/kept row, rejected = sibling rows via `parent_id`; attach `generation_attempts` telemetry (model, repetition_score) as quality filter; emit rows in buildDPO input schema with provenance (chat/message ids, swipe indexes); honor visibility + consent gates.

## Acceptance Criteria

- [ ] Pair reconstruction correct for continuation + swipe cases (`continuation_index` :808 handled).
- [ ] Rows carry full provenance and pass the consent/moderation gate.
- [ ] Low-quality rejected rows (repetition_score below threshold) excluded and counted.
- [ ] Tests cover multi-swipe, regenerated, and hidden-message edge cases.

## Caveats

- [ ] Privacy: consent + moderation gates at the extraction boundary; hidden messages never exported.
- [ ] Stale state: extractor is read-only over existing rows; no migration needed.
- [ ] Observability: counts of pairs built / filtered per run.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
