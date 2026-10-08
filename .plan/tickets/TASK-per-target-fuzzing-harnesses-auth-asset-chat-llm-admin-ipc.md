<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Per-target fuzzing harnesses — auth, asset, chat, llm, admin, IPC

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** Fuzzing Infrastructure

**Summary:**

Implement per-target harnesses for: auth (40% budget), asset upload (25%), chat (15%), llm prompt (10%), admin/config (5%), IPC (5%). Each harness must be deterministic, dependency-free (mock DB/cache/LLM), reset in <10ms, and deduplicate crashes by stack trace + input hash. The `tests/fuzz/` directory does not exist yet.

This extends the `FuzzTestFramework` built on the infrastructure ticket — do not re-implement the framework itself. Builds on `scripts/generate-schema-fuzz.ts` which generates validity-only fast-check tests for 394 schemas; harnesses probe the REJECT path that schema-fuzz does not reach.

**Context:**

The per-target harnesses are the concrete fuzzing entry points that translate the `FuzzTestFramework` runner into actual test executions per surface. The epic's coverage budget (auth 40%, asset 25%, chat 15%, llm 10%, admin/config 5%, IPC 5%) is just a ratio — it only becomes real coverage when each harness is implemented and wired to the runner. Without harnesses, the runner has nothing to execute and the mutation engine has no test subject.

Constraint: `scripts/generate-schema-fuzz.ts` generates validity-only tests for 394 schemas — by construction it emits only schema-VALID values and never exercises a validator's REJECT path. This is the precise gap harnesses must close: each target harness must emit invalid/malformed inputs to trigger the reject path that schema-fuzz cannot reach. Auth and asset targets, being the highest-budget surfaces, must be tackled first to maximize crash-finding ROI.

Alternative: rely on schema-fuzz alone for coverage. Rejected — validity-only fuzzing is blind to the class of bugs that fail validation, which is the most common wire-protocol attack surface. The harnesses exist specifically to target the reject path.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
