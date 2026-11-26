<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Restrict ACP strategy enum to failover

**Status:** Done
**Status Note:** Shipped on dev — the harness strategy union is restricted to `failover` (`packages/core/src/config/schema/harness.ts:92-93`); the earlier `failover|best-of|split` union is gone from the schema and its mirrors.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

G10 (harness-acp-implementation-review-2026-11-03.md:191; plan §3.4) — shipped: the strategy union is restricted to `failover` (`packages/core/src/config/schema/harness.ts:92-93`); `best-of` and `split` are rejected by validation (`packages/core/src/config/sections/harness.test.ts:114-119`). AC: a `best-of`/`split` strategy fails `validateProfile`; `failover` configs are unchanged. Un-restrict when best-of/split land (epic tasks).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete — strategy union restricted to `failover` (`packages/core/src/config/schema/harness.ts:92-93`)
- [x] Tests passing — `best-of`/`split` rejection covered by `packages/core/src/config/sections/harness.test.ts:114-119`
- [x] Documentation updated — no `best-of`/`split` value remains in the shipped harness schema or its mirrors
