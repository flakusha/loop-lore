<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — schedule Workflow / GM Routing batch (P2-C/P2-D)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Type:** Task
**Summary:** The 5-issue Workflow / GM Routing cluster (open-untriaged.md § New clusters) covers persist run sessions, strip mention prefix, assistant-GM handoff, shadow-note steering, and WorkflowRunner reuse. Each has an existing epic home (epic-workflow-engine.md for runner/session persistence; epic-assistant-gm-flows.md for GM handoff and shadow-note steering). This ticket captures the batch.
**Context:** Per open-untriaged.md § Suggested home, suggested home is P2-C/P2-D. Per open-untriaged.md § 2026-09-25, the workflow engine already owns runner/session persistence; GM handoff and shadow-note steering stay with the assistant/GM epic. No duplicate epic justified.

## Issues in scope

| Git issue | Topic | Existing epic / ticket pointer |
| --- | --- | --- |
| 7637627 | persist run sessions | TASK-workflow-persist-run-sessions-beyond-process-memory.md (epic-workflow-engine) |
| 83622b7 | strip mention prefix | TASK-workflow-strip-group-chat-mention-prefix-before-trigger-matc.md (epic-workflow-engine) |
| f4fd21e | assistant-GM handoff | epic-assistant-gm-flows.md |
| becc58b | shadow-note steering | epic-assistant-gm-flows.md |
| 30803ca | reuse WorkflowRunner | epic-workflow-engine.md |

**Acceptance Criteria:**

- [ ] Each of the 5 git issues linked to its existing epic or ticket file.
- [ ] Persist run sessions tested across process restart (workflow sessions survive process restart + resume).
- [ ] Strip mention prefix verified in group chat where @assistant triggers a workflow.
- [ ] Assistant-GM handoff tested end-to-end (assistant yields to GM mid-response).
- [ ] index.json updated via plan:sync:fix; no duplicate epic created.

**Tags:** workflow, gm-routing, runner, assistant-gm, shadow-notes
**Related:** .plan/backlog/open-untriaged.md § New clusters, .plan/epics/epic-workflow-engine.md, .plan/epics/epic-assistant-gm-flows.md


git issue: f4ff46f
