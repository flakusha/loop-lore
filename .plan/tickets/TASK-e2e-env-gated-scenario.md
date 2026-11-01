<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: e2e env-gated scenario

**Status:** Done
**Status Note:** fixed 2026-11-01 — tests/e2e/flows/harness-acp.test.ts (env-gated behind HARNESSE2E=1; skips loudly without the marker, 0 fail).
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
(reused — no `tests/e2e/fixtures/` duplicate). The scenario is gated behind
`HARNESSE2E=1` and skips loudly without the marker, so plain `bun run check`
runs are unaffected. Alternatives considered: a Playwright browser spec was
rejected — the surface under test is the harness stdio wire, not the web UI;
the inproc `bun test` e2e pool is the correct runner.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing — HARNESSE2E=1: 5 pass / 0 fail; without marker: 5 skip / 0 fail
- [x] Documentation updated — N/A, test-only change (ticket Context documents the design)
