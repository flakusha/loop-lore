<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Effect v4 S6 resource safety spike

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-effect-v4-adoption-evaluation

**Summary:**

Spike S6 (pillar never measured): Effect.acquireRelease/Scope vs hand-rolled try/finally on the real src/async/offload.ts path plus any other finally-heavy leaf module found by grep. Bar to ADOPT: net-negative LOC AND finalizer parity on happy/throw/scope-exit paths — the S3 forkScoped footgun (finalizers silently skipped on early scope exit) must be an explicit negative-space case. Measure in .tmp scratch; record LOC + finalizer matrix in the epic's Spike Results; REJECT with numbers if either bar fails.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
