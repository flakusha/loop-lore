<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: immersion gate refusal narration path

**Status:** Not Started
**Priority:** high
**Epic:** epic-immersion-consistency-gate
**Tags:** immersion
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

WI-5 of epic-immersion-consistency-gate: soft-refuse injects attempted-action framing into the GM/narration prompt flow; hard-block emits an OOC system notice (MessageKind conventions) with reason plus skip-turn affordance wired to src/turning (skip-cooldown + turn-manager interlock). Refusal narrated in-fiction, never moralized. See .plan/epics/epic-immersion-consistency-gate.md.

**Context:**

Refusal is narrated, never moralized: soft-refusal output explains the obstacle in fiction, preserving story flow; OOC reasons surface only on hard-block. Interlock with skip: hard-block offers actor turn skip; soft-refuse consumes the attempt.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
