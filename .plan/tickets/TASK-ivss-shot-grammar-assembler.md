<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS shot grammar assembler

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, prompts, assembler
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Compile scenes into the resolved prompt ([Shot N] absolute-timestamp blocks + soundscape/music) plus reference-slot assignment, with memory-budgeted assembly (src/memory/budget.ts pattern). AC: assembler output is byte-stable for fixed inputs; over-budget prompts are truncated per a documented priority order, never silently.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
