<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit follow-up: triggerAutoGeneration .catch path untested

**Status:** ✅ Resolved (commit `00d5e0f2`)
**Priority:** low
**Effort:** Medium

## Summary

Audit found lifecycle triggerAutoGeneration .catch handler in src/generation/lifecycle.ts has zero unit coverage. The 4xx fail-path and DB-failure cleanup branches are equally untested. See audit .tmp/audit/batch-C-rbac-refactor.md finding MEDIUM.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Fixed in commit `00d5e0f2` (`feat(auth): wire DI authConfig in export routes; tests for triggerAutoGeneration catch path + DI override`).

Added a dedicated test file `src/generation/auto-gen/auto-generation.test.ts` (310 lines, 5 tests) that pins the catch-path contract of `triggerAutoGeneration`:

1. **`an error from a pipeline step is caught, routed to asyncStore.fail, not rethrown`** — throws from `cancelGenerationByChat` inside the orchestrator's try-block; asserts (a) the error does NOT propagate to the caller (no `unhandledRejection`), (b) `asyncStore.fail(requestId, { userId }, String(error))` is called exactly once with the right args.
2. **`handleGenerationError receives the same error but suppresses failGeneration when attemptId is undefined`** — verifies the inner `if (attemptId)` guard, so a missing-attempt row does NOT call `failGeneration` but still routes to `asyncStore.fail`.
3. **`asyncStore omitted → error still swallowed (no throw, no fail call)`** — pins the "caller never sees a throw" half of the contract even when the orchestrator has nowhere to write status.
4. **`asyncStore provided but requestId missing → fail() is skipped`** — pins the dual-gate (BOTH `asyncStore` AND `requestId` required) on the catch block.
5. **`handleGenerationError exercises buffer.signalError (catch path runs end-to-end)`** — uses a `getOrCreateBuffer` spy to prove the catch path reaches the buffer side-effect (`signalError(...)`), not just the `failGeneration` telemetry side. Catches the case where a missing dep silently swallows the buffer branch via the inner `catch { /* best-effort */ }` guard.

Helpers (`makeFakeAsyncStore`, `makeThrowingDeps`, `makeThrowingDepsWithBufferSpy`, `makeConfig`) keep the tests focused on the catch-path contract; the orchestrator's only consult of `AsyncStore` in this contract is `fail()`.

The orchestrator is invoked via `void` from route handlers, so an unhandled throw would surface as `unhandledRejection` and crash the process. Test #1 is the regression that catches that.

Verification (scoped, no project-wide check):

```
$ bun test src/middleware/auth.test.ts src/generation/auto-gen/auto-generation.test.ts
 20 pass
 0 fail
```

## Related

- `TASK-audit-follow-up-resolveuseridfromrequest-authconfig-di-path-` — sibling ticket in the same batch
- git issue `1448001`