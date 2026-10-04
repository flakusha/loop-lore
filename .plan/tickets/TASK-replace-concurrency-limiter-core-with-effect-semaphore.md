<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Replace concurrency-limiter core with Effect Semaphore

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-effect-v4-adoption-evaluation

**Summary:**

Follow-up from spike S9 (epic-effect-v4-adoption-evaluation, Spike Results row S9): stable effect@4.0.0 now ships Semaphore.make/withPermits (absent in rc.117), and the S6 replica harness measured the ConcurrencyLimiter acquire/release core at 53 to 15 code lines (-72 percent) with full finalizer-matrix parity — abandon-midflight is strictly better (interrupt releases the permit); immediate-scope-exit loses body start (lost work, not a leak; acquire never ran) and has no current production trigger. Scope: replace ONLY the acquire/release core of src/llm/concurrency-limiter.ts with Semaphore; the per-key registry, introspection (inUse/pending/capacity), capacity-mismatch guard, and ResourceManager priority scheduling have NO Effect counterpart and MUST be retained around the core. Contract: the limiter's public API and its colocated tests pass unmodified; add interrupt-path coverage for the new release behavior. Bars: all existing limiter + ResourceManager tests green unmodified, LOC net-negative on the core, no API change.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
