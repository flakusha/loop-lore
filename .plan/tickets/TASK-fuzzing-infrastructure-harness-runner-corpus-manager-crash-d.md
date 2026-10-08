<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Fuzzing infrastructure — harness runner, corpus manager, crash deduplicator

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** Fuzzing Infrastructure

**Summary:**

Implement `FuzzTestFramework`, `FuzzTestConfig`, `FuzzCorpus`, `FuzzMutator`, and `FuzzCrash` interfaces from the epic design block. The harness runner must meet hard requirements: deterministic init (fixed seeds, mock time), no external deps (mock DB/cache/LLM), <10ms reset, 1s per-iteration budget, 512MB memory cap, crash dedup by stack trace + input hash. `tests/fuzz/` does not exist yet — create it.

This builds on `scripts/generate-schema-fuzz.ts` which generates `src/validation/schema-fuzz.generated.test.ts` (394 schemas, fast-check based, validity-only — does NOT probe reject paths). The mutation/harness work complements, not replaces, that foundation.

**Context:**

The harness runner is the execution layer every other fuzzing ticket depends on. Without it, `tests/fuzz/` remains an empty directory and no per-target harness can run — the corpus manager needs a place to store seeds, the crash deduplicator needs a format to serialize `FuzzCrash` objects, and the mutation engine needs a runner to drive iterations. This ticket implements `FuzzTestFramework` from the epic design block and is the prerequisite for all subsequent fuzzing work.

Hard constraints from the epic: deterministic init (fixed seeds, mock time), no external deps (mock DB/cache/LLM), <10ms reset between iterations, 1s per-iteration budget, 512MB memory cap, crash dedup by stack trace + input hash. These are not tunable — they are the contract the per-target harnesses will build against. The `scripts/generate-schema-fuzz.ts` generator (validity-only, gated by `fuzz - generated tests`) provides a complementary foundation: this ticket does not touch that script.

Alternative: defer the runner and implement each target's harness standalone. Accepted in sketch form on `feat-auto-test-generation` and caused repeated infrastructure reimplementation per target. A shared runner with a stable interface is the smaller total diff.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
