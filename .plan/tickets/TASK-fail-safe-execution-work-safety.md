<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fail-Safe Execution & Work Safety

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-runtime-integrity-fail-safes

## Summary

Implement fail-safe execution patterns and work safety for the
application run: an atomic operation framework for complex business
logic, shutdown data safety (ensuring in-flight operations complete
before exit), subprocess data preservation (draining work before kill),
and signal-safe mutation (deferring signals during database operations).

## Why

The current graceful shutdown (`src/server/start.ts:180-194`) stops
servers and flushes the logger but does **not** wait for in-flight
database operations to complete. The hard-exit guard (`src/server/start.ts:175`)
kills subprocesses without data preservation. Some mutation routes
skip `format_version` checks, leaving stale-write windows. Signals
(SIGTERM, SIGINT, SIGHUP) can interrupt database mutations mid-way,
leaving partial state. There is no atomic operation framework for
complex multi-step business logic.

## Current State

- `src/server/start.ts:180-194` — graceful shutdown stops servers
  and flushes logger, but does not wait for in-flight DB operations.
- `src/server/start.ts:175-177` — hard-exit guard kills subprocesses
  (`serverManager.killAllSync()`) without data preservation.
- `src/server/start.ts:196-220` — signal handlers call shutdown
  without data safety guarantees.
- `src/routes/` — some routes use `database.transaction().execute()`,
  others do not. Inconsistent transaction usage.
- `characters/update.ts` — `format_version` is required but write-path
  enforcement is incomplete for all mutation routes.
- No atomic operation framework exists for complex multi-step business logic.
- No signal-safe mutation mechanism exists.
- No subprocess work preservation mechanism exists.

## Acceptance Criteria

### Atomic Operation Framework

- [ ] A library (`src/atomic/`) providing `atomicOperation()` that
  wraps multi-step business logic in a transaction. Either all steps
  complete or all roll back — no partial state.
- [ ] All write paths in `src/routes/` use the atomic operation
  framework (or `database.transaction()`) — no raw write paths
  outside a transaction.
- [ ] High-contention operations (trade execution, scene transitions,
  multi-table mutations) use the atomic operation framework.
- [ ] Atomic operations support rollback with a clear error envelope
  (409 Conflict or 500 Internal Server Error, depending on the failure).
- [ ] `format_version` optimistic concurrency is enforced in the
  atomic operation framework for all high-contention tables.

### Shutdown Data Safety

- [ ] The graceful shutdown handler (`src/server/start.ts`) waits
  for all in-flight database operations to complete or roll back
  before stopping servers.
- [ ] In-flight operations are tracked and drained during shutdown.
  No data is lost because the server stopped mid-write.
- [ ] Shutdown timeout is configurable (default: 10 seconds).
  If operations don't complete within the timeout, the instance
  enters safe mode (read-only) before force-exiting.
- [ ] The shutdown sequence is: drain in-flight operations → stop
  servers → flush logger → exit.

### Subprocess Data Preservation

- [ ] The hard-exit guard (`src/server/start.ts:175`) drains
  in-flight work from subprocesses before killing them.
- [ ] External inference servers and workers complete or checkpoint
  their current work before termination.
- [ ] Checkpointing is atomic: either the full work unit completes
  or it is rolled back to the last checkpoint.
- [ ] `serverManager.killAllSync()` is replaced with a graceful
  drain-then-kill sequence.

### Signal-Safe Mutation

- [ ] SIGTERM, SIGINT, SIGHUP are deferred during database mutations.
  Signals are queued and processed after the current operation
  completes or rolls back.
- [ ] Signal deferral uses atomic flags, not shared mutable state,
  to avoid race conditions.
- [ ] If a signal is received during a mutation, the operation is
  rolled back and the signal is processed.
- [ ] Uncaught exceptions and unhandled rejections trigger graceful
  shutdown with data safety guarantees (not immediate exit).

### `bun run check` green; unit and integration tests for atomic
  operations, shutdown data safety, subprocess preservation, and signal-safe mutation.

## Implementation Notes

- **Atomic operation framework**: model as a wrapper around
  `database.transaction().execute()`. The framework provides
  `atomicOperation(name, steps)` where `steps` is an array of
  async functions that execute within a single transaction.
  If any step fails, the transaction rolls back.
- **Transaction coverage**: audit all write paths in `src/routes/`
  and ensure every mutation runs within a transaction or the
  atomic operation framework. Add transaction wrappers where missing.
- **Shutdown data safety**: modify `src/server/start.ts:shutdown()`
  to drain in-flight operations before stopping servers. Use a
  reference counter or promise tracking to monitor active operations.
- **Subprocess preservation**: modify `ServerExternalManager` to
  support graceful drain before kill. External inference servers
  (llama.cpp, sd.cpp, llama-swap) should receive a drain signal
  and complete current generation tasks before termination.
- **Signal safety**: replace direct `process.on("SIGTERM", () => shutdown())`
  with a signal deferral mechanism. Use an atomic flag
  (`Atomics.compareExchange` or `SharedArrayBuffer`) to defer
  signals during mutations.
- **format_version enforcement**: complete the write-path enforcement
  for all mutation routes, starting with high-contention tables
  (`messages`, `chat_participants`, `actor_memories`, `world_states`).
- **Sequence**: Phase 2 of `epic-runtime-integrity-fail-safes`.
  Depends on Phase 1 (runtime integrity watchdog) being complete.

## Files

- `src/atomic/` (new): `operation.ts`, `framework.ts`,
  `rollback.ts`, `envelope.ts`
- `src/server/start.ts` — modify shutdown and signal handling
- `src/services/server-external-manager/` — add graceful drain
- `src/routes/` — add transaction wrappers where missing
- `src/characters/update.ts`, `src/trade/index.ts`, `src/messages/handle-scene-transitions.ts` — complete `format_version` enforcement
- `src/config/sections/` — atomic operation and shutdown config section
- `tests/` — unit tests for atomic operations, signal deferral;
  integration tests for shutdown data safety, subprocess preservation

## Dependencies

- `epic-runtime-integrity-fail-safes` (this epic)
- `epic-data-integrity-acid.md` — `format_version` enforcement
- `epic-local-process-swarm.md` — supervisor, subprocess lifecycle
- `src/server/start.ts` — graceful shutdown, hard-exit guard, signal handling
- `src/services/server-external-manager/` — subprocess management
