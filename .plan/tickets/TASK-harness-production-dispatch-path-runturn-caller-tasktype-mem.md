<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness-production-dispatch-path-runturn-caller-tasktype-member

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Wire `runTurn` to a production caller: the ACP turn pipeline is dead code at runtime — `runTurn` (`src/integrations/harness/profile-selector.ts:215`) has no production caller (only def + tests hit it), `TaskType` (`src/generation/routing/task-signal.ts:21`) has no `"harness"` member, and nothing under `src/integrations/harness/` is imported by chat/generation. Epic task "message persistence mapping" (`TASK-message-persistence-mapping`, Not Started) covers the storage half; this ticket covers the dispatch half. Depends on `TASK-acp-composition-root-wiring` (Not Started) for the shared runtime; coordinate so the caller consumes the composed runtime, not a standalone surface.

**Context:**

## Why

Parity matrix gap (ABSENT in production): the whole outbound ACP stack — selector, registry, driver seam, isolation gate — is constructed only in tests. A user-facing trigger (chat slash-command, assistant command-registry verb, or generation-route hook) must route an approved harness turn through the composed runtime and map the result to chat/SSE. Without this, all adapter/permission/ToS work is unreachable in production.

## Scope

- Add `"harness"` to `TaskType` (or map to an existing member with an explicit decision recorded here); extend `toHarnessTaskType` accordingly.
- One production caller of `runTurn` through the composed runtime (chat command, registry verb, or route hook — pick the smallest that fits the command-registry precedent in `TASK-harness-frontend-consolidation` AC 2).
- Message persistence mapping stays in `TASK-message-persistence-mapping` (assistant rows with `tool_calls`/`thinking`, `tool_result` rows with `MessageContentType.ToolResult` + `metadata.tool_call_id`, ACP `session/update` → SSE frames); this ticket wires the trigger, that ticket lands the rows.

## Do NOT touch

- Do NOT duplicate the runtime composition (`TASK-acp-composition-root-wiring` owns it).
- Do NOT bypass the isolation gate, the ToS dispatch guard, or the permission queue.

**Acceptance Criteria:**

- [ ] A production code path calls `runTurn` through the composed harness runtime (not a test-only construction).
- [ ] `TaskType` covers harness work (new member or recorded map-to-existing decision + `toHarnessTaskType` update).
- [ ] Dispatch honors isolation gate + ToS guard + permission approval (denials surface, never bypassed).
- [ ] Unit test at select/runTurn level proving the caller routes through the runtime.
