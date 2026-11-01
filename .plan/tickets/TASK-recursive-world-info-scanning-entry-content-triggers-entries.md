<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Recursive world-info scanning: entry-content triggers entries with bounded depth

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-lorebook-recursive-scanning
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Context

SillyTavern-style recursive World Info scanning (entry content itself triggering other entries — layered worldbuilding: a faction entry mentioning an artifact pulls the artifact lore) is absent. Today activation scans only the conversation window and timeline events (`src/assistant/lore/reveal-condition.ts:39-51`); injected entry text is never re-scanned. Coverage check: `giwt search "recursive scanning"` -> no matches; lorebook search results contain no recursion ticket (`reveal-condition.ts` recursion is condition-tree parsing, not entry-to-entry activation).

Epic: epic-lorebook-recursive-scanning.md.

## Summary

Fixpoint pass after the first activation: scan admitted entry content for other entries keys, admit new matches, repeat with a bounded depth cap (ST defaults effectively shallow). Must respect token-budget, cooldown and activation-chance gates each round to avoid blowups. ReDoS hardening precedent already landed (`TASK-redos-lore-activation-builds-regexp-from-author-controlled-k`, Done).

## Acceptance Criteria

- [ ] Entry-content keys trigger other entries within a configurable recursion depth (default shallow, config key).
- [ ] Cooldown, activation_chance, rarity and token-budget gates enforced on recursively admitted entries.
- [ ] Cycle-safe: an entry never re-admits itself or loops A->B->A within one turn.
- [ ] Fixtures: chained faction->artifact admission; depth-cap cutoff; no regression in flat activation tests.

## Caveats

- [ ] Runaway growth: depth cap + token budget mandatory; recursion aborts the pass when the budget is hit.
- [ ] Partial failure: a parse/regression error in one entry fails open to flat (non-recursive) activation.
- [ ] Observability: count recursive admits + aborted passes per turn.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
