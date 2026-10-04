<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Effect v4 S7 structured fan-out spike

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-effect-v4-adoption-evaluation

**Summary:**

Spike S7: Effect.all / Effect.forEach (bounded concurrency) vs Promise.all + src/llm/concurrency-limiter.ts on one real batch path (candidates by grep: assets batch ops, emotion-avatar variant fan-out, memory provisioning). Bar to ADOPT: net-negative LOC, identical partial-failure visibility and cancellation semantics vs the current path, and no attempt to replace the limiter itself (S3 REJECT stands — compose only). Measure in .tmp scratch; record LOC + parity matrix in the epic; REJECT with numbers if any bar fails.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
