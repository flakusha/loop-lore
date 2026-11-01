<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP driver module

**Status:** Done
**Status Note:** Landed in 34a018b09 (HarnessDriver driver.ts + session/cancel wire verb + jsonrpc-process onRequest).
**Priority:** high
**Effort:** Large
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Implement HarnessDriver interface under src/integrations/harness/ with discoverModels, runPrompt, cancel, approvePermission; adapter registration via src/integrations/registry; reuse createMessageBridge moderation gate. Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Context:**

The ACP adapter ladder landed flavor adapters (omp/opencode/codex/claude-code) over the generic engine, but loop-lore had no single orchestration seam over them. This ticket adds `HarnessDriver` (driver.ts) binding one profile: `discoverModels`, `runPrompt` (failures as typed `DriverRunResult` values, never throws), `cancel`, `approvePermission`, plus `pendingPermission`/`close`. The engine gains the missing wire verbs: `session/cancel` (notification, ordered after the prompt dispatch so a fast cancel cannot overtake its own turn) and server-originated request handling in jsonrpc-process (`onRequest` + `notify`; unknown methods answer -32601) — `session/request_permission` parks as a `PendingPermission` until `respondPermission` delivers the outcome; `fs/read_text_file` is served by an injected reader or refused, fail-closed. Flavor factories pass the optional knobs through; fakes.ts grew the widened contract so registry/selector tests keep compiling. Registration lands via driver-bridge.ts: `createHarnessProtocolAdapter`/`registerHarnessDriver` wrap a driver as a `ProtocolAdapter` for `createBridgeRegistry`, and outbound moderation reuses `createMessageBridge`'s `moderationGate` — no second gate implementation. Constraints honored: per-test fixture from TASK-fake-acp-server-test-fixture (`createHarnessFixture`), no sleeps (wire-event and permission-hook awaits), typed `@throws` on session-state violations, cancel/pending state cleared on close and on child exit (no stale permission). Alternative considered — a second scheduler beside ProfileSelector — rejected: the driver is the per-profile seam; selection/failover stays with the selector.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
