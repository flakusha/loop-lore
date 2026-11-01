<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: fake ACP server test fixture

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add fake ACP server fixture speaking initialize/session/new/session/prompt/session/cancel/session/request_permission/fs/read_text_file for unit tests; in-memory SQLite + create-test-db. Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Context:**

The generic-acp engine landed with a minimal fake server (initialize / session/new / set_config_option / prompt / _omp/usage) tuned to adapter tests. This ticket completes the fixture to the ACP surface the driver and permission flows need: `session/cancel` (request and bare-notification shapes; resolves a pending prompt), plus the server-originated mid-prompt client requests `session/request_permission` and `fs/read_text_file` (ask, await the client's outcome, continue the prompt). The child logs every observed client reaction to `acp-log.jsonl`, exposed via `FakeAcpServer.readLog()`, so tests assert what the client actually sent back across the wire, in arrival order. A composite fixture (`createHarnessFixture` in harness-fixture.ts) pairs the server with a fresh in-memory `createTestDb()` database so driver/registry suites get wire and persisted state under one idempotent `cleanup()`. Constraints honored: one child + one DB per test (mkdtemp paths, no ports, no sleeps, no env mutation of the runner). Reusable by TASK-acp-driver-module and later harness tickets. Alternative considered — driving the fixture only through the adapter engine — rejected: the raw-stdio seam isolates fixture failures from engine behavior, and the engine extension is ticket-2 scope.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
