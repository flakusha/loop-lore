<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — coverage waivers + frontend batches (release-010 hardening)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-release-010
**Type:** Task
**Summary:** The 5-issue Coverage waivers + frontend batches cluster (backlog-archive.md § open-untriaged § New clusters) groups 2 coverage-waiver tickets (sub-floor waiver, raise below-floor modules) and 3 frontend batches (alpine admin/npc/settings clusters, VN pages/new-chat/quests/worlds). This ticket captures the batch under release-010 hardening so the work lands with the size-strict and size-gate ceiling recovery.
**Context:** Per backlog-archive.md § open-untriaged § Suggested home, suggested home is release-010 hardening. The 2 coverage-waiver tickets are linked to TASK-waiver-coverage-floor-below-80-for-plugins-frontend-native-i.md and a fresh ticket for raising below-floor modules.

## Issues in scope

| Git issue | Topic | Existing ticket / suggested home |
| --- | --- | --- |
| be72331 | sub-floor waiver | TASK-waiver-coverage-floor-below-80-for-plugins-frontend-native-i.md |
| b4789c2 | raise below-floor modules | (fresh ticket to be filed for raise-below-floor modules) |
| 78c179f | alpine admin/npc/settings | epic-testing-qa (existing; per backlog-archive.md § open-untriaged § 2026-09-25) |
| 55f201f | VN pages/new-chat/quests/worlds | epic-testing-qa (existing; per backlog-archive.md § open-untriaged § 2026-09-25) |

**Acceptance Criteria:**

- [ ] The 2 coverage-waiver tickets reviewed and either justified or replaced with module-by-module raise tickets.
- [ ] The 3 frontend batches have at least one smoke test per cluster (admin, npc, settings; VN, new-chat, quests, worlds).
- [ ] coverage-floor gate green; below-floor modules either raised to floor or explicitly waived with documented justification.
- [ ] index.json updated via plan:sync:fix.

**Tags:** coverage, waivers, frontend, alpine, testing-qa
**Related:** .plan/backlog-archive.md § New clusters, .plan/epics/epic-testing-qa.md, .plan/tickets/TASK-waiver-coverage-floor-below-80-for-plugins-frontend-native-i.md

## Progress — check-debt-green (2026-11-12)

Export-gap paydown in this ticket's lanes, without touching the waiver set:
new and expanded colocated tests cover the harness turn-queue store, row views
and status enums, repo-access grants and settings, inbound settings, the inbound
ACP and MCP stdio servers, harness metrics/prometheus/settings-view/stream, the
admin-harness queue schemas, card-portability normalizers and quota surfaces,
plus the VN choice-cards state split and the freeform-input affordance. Every
new case passed an adversarial review (tautology, echo and incidental-default
screen); two weak assertions were rewritten as behavior checks. The coverage-gaps
gate is green against the committed baseline with no baseline change and no
new-debt flag; the fuzz regen is a pure staleness refresh. This does not close
the ticket: the waiver review and the floor-raise items remain open.


git issue: 04475df
