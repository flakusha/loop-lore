<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness subagent delegation (delegate batch above TurnManager)

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** `delegate_task({goal|tasks[]})` with list/steer/stop, background + no-poll discipline, per-task schemas, depth-derived roles + budgets — layered ABOVE TurnManager/turn-selector, never a parallel scheduler.
**Context:** No subagent spawn/delegate/reap infra exists. Reuse: `workflow-session-store.ts` + `src/async/store.ts` (persistence), `tool-executor.ts` + event bus (execution), `pluginAgentRoleSection` (role prompt). Shapes: hermes `delegate_tool` (groups, steer-queue merge, credential lease, leaf-vs-orchestrator depth, max_concurrent_children, interrupt propagation) + opencode `tool/task.ts` (tasks[] batch, resumable task_id, `<task state><summary><result>` XML envelope).
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `SubagentTask` + `DelegationRecord` (role id + prompt + tool subset + timeout) persisted via workflow-session-store/async-store patterns; execution wires tool-executor + event bus.
- [ ] `delegate_task` supports `action=list|steer|stop`, `background` flag with auto-notify + no-poll discipline, per-task output schemas; group batch returns together.
- [ ] Depth-derived capability (leaf barred from delegate + sensitive tools like clarify/memory/cronjob), concurrency caps, one-shot budgets, spawn kill-switch, interrupt propagation, credential lease per child; parent sees summary only.
- [ ] Governor deny-by-default budgets enforced on every spawn (ungated loops are a regression). Unit + integration tests for batch/steer/stop/reap.

## Related Files

- `src/assistant/workflow-session-store.ts`, `src/async/store.ts`, `src/plugins/tool-executor.ts`, `event-bus.ts`
- `src/turning/turn-manager/`, `src/group-chat/turn-selector.ts` (layer above, never duplicate)
- `src/autonomy/governor/` (budget gate), `epic-local-process-swarm.md` (this record is the single-process precursor)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
