<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: e2e env-gated scenario

**Status:** Done
**Status Note:** fixed 2026-11-01 — tests/e2e/flows/harness-acp.test.ts landed env-gated behind HARNESSE2E=1; UN-GATED 2026-11-15 (branch harness-e2e-ungate): the scenario now runs in the DEFAULT e2e pool (gate invocation `E2E_SAFEGUARD=1 bun test --parallel=4 tests/e2e/ --isolate` → 5 pass / 0 fail) and the `HARNESSE2E` marker plus its loud-skip block are gone. The gate had hidden a stale wire expectation — the permission answer is the ACP spec's selected variant (`{outcome:{outcome:"selected",optionId}}`), which the e2e now asserts.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add Playwright e2e scenario using fake-harness fixture binary in tests/e2e/fixtures/ speaking ACP; gate behind env HARNESSE2E=1; reuse existing e2e patterns. Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Context:**

The external-harness ACP surface (HarnessDriver, fake-acp-server +
harness-fixture, isolation gate, flavor adapters) is landed on dev; this
scenario exercises it end-to-end over the wire from `tests/e2e/`. The fake
fixture binary already lives at `src/integrations/harness/fake-acp-server.ts`
(reused — no `tests/e2e/fixtures/` duplicate). The scenario runs in the DEFAULT
e2e pool — the gate invocation is
`E2E_SAFEGUARD=1 bun test --parallel=4 tests/e2e/ --isolate` — and the
`HARNESSE2E` marker plus its loud-skip block are gone (the gate had hidden a
stale permission-wire expectation, since corrected to the ACP spec's
`selected` variant). Alternatives considered: a Playwright browser spec was
rejected — the surface under test is the harness stdio wire, not the web UI;
the inproc `bun test` e2e pool is the correct runner.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing — default e2e pool: 5 pass / 0 fail (`E2E_SAFEGUARD=1 bun test --parallel=4 tests/e2e/ --isolate`); the harness→chat SSE flow `tests/e2e/flows/harness-sse.test.ts` adds 2 pass / 0 fail
- [x] Documentation updated — N/A, test-only change (ticket Context documents the design)

**Resolved:** 2026-11-01 registry-driven close: git issue e8e777f (registry tip: 6e760817a Konstantin Fedotov Auto-closed: appended .md marker marks TASK-E2E-ENV-GATED-SCENARIO done)
