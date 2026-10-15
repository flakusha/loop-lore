<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MCP Tasks extension as long-operation state machine

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-external-creative-tool-bridge

**Summary:**

Adopt tasks/get, tasks/update, tasks/cancel, the five statuses and durable taskId persistence as the house pattern for long-running external work.

**Context:**

MCP Tasks extension (spec 2026-07-28, `ext-tasks` repo), read directly 2026-10-15. Five statuses: `working`, `input_required`, `completed`, `failed`, `cancelled`; the last three are terminal. Methods: `tasks/get`, `tasks/update`, `tasks/cancel`. Fields: `taskId`, `ttlMs`, `pollIntervalMs`, `inputRequests`, `result`, `error`.

Spec requirements quoted verbatim:

- *"The task must be durably created before sending the response."*
- *"Store task IDs durably so polling can resume after a client crash or restart."*
- Cancellation is cooperative — *"the server acknowledges the intent but is not obligated to stop the work"*.

Why this ticket exists: `src/services/server-external-manager/` has **no restart-on-crash and no pause** (verified 2026-10-15 — no `SIGCHLD`, no child `onExit` anywhere). Those are not new machinery; they are two of the five Task statuses plus a persisted handle. The `input_required` state is also the human-in-the-loop gate that the critique loop and the review gate lack.

Worth doing even if no creative-app adapter ever lands — the state machine is reused by every long-running job in the platform.

Depends on `TASK-mcp-client-over-stdio-and-streamable-http`.

**Acceptance Criteria:**

- [ ] **Behaviour:** all five statuses reachable; `completed`, `failed` and `cancelled` are terminal — no transition out of a terminal state.
- [ ] **Behaviour:** `taskId` is durable — a simulated client disconnect mid-poll, then reconnect with the same id, resumes at the correct state.
- [ ] **Tests:** happy path; failure path carrying the JSON-RPC error; cancellation acknowledged then cooperative completion still reaching a terminal state; TTL expiry; `pollIntervalMs` respected (no busy-poll).
- [ ] **Edge cases:** server restarts mid-task; duplicate `taskId`; `tasks/update` for an unknown or already-satisfied key (spec: ignore, do not error); `input_required` with an empty `inputRequests` map; a result payload larger than one message.
- [ ] **Concurrency / TOCTOU:** two concurrent `tasks/cancel` for the same id do not double-fire teardown; the state write is a compare-and-set so a late poll cannot resurrect a terminal task.
- [ ] **Security:** a task handle is **not a capability** — an unauthenticated caller cannot read or cancel another caller's task; TTL is enforced server-side, never trusted from the client.
- [ ] **Regressions:** existing generation and cancel paths behave identically.
- [ ] **Repo gates:** `bun run check` green.
