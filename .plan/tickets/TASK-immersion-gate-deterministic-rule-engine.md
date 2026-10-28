<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: immersion gate deterministic rule engine

**Status:** Not Started
**Priority:** high
**Epic:** epic-immersion-consistency-gate
**Tags:** immersion
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

WI-2 of epic-immersion-consistency-gate: deterministic rule engine checking extracted claims against actor state flags, src/rpg/skills ownership, src/story/items inventory membership, and pending failed-check consequences. Explainable GateVerdict (severity, ruleId, claims, stateSnapshot); deterministic findings win over the LLM classifier. See .plan/epics/epic-immersion-consistency-gate.md.

**Context:**

epic-player-state-machine is not implemented, so this engine builds SC10-style adapters over what exists (skills, stats, inventory, state flags) and documents the seam for a later swap. Verdicts must be explainable: ruleId plus the missing precondition, never a silent block.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
