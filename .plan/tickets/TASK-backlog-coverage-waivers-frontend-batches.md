<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: backlog — coverage waivers + frontend batches (release-010 hardening)

**Status:** open
**Priority:** medium
**Effort:** Medium
**Type:** Task
**Summary:** The 5-issue Coverage waivers + frontend batches cluster (open-untriaged.md § New clusters) groups 2 coverage-waiver tickets (sub-floor waiver, raise below-floor modules) and 3 frontend batches (alpine admin/npc/settings clusters, VN pages/new-chat/quests/worlds). This ticket captures the batch under release-010 hardening so the work lands with the size-strict and size-gate ceiling recovery.
**Context:** Per open-untriaged.md § Suggested home, suggested home is release-010 hardening. The 2 coverage-waiver tickets are linked to TASK-waiver-coverage-floor-below-80-for-plugins-frontend-native-i.md and a fresh ticket for raising below-floor modules.

## Issues in scope

| Git issue | Topic | Existing ticket / suggested home |
| --- | --- | --- |
| be72331 | sub-floor waiver | TASK-waiver-coverage-floor-below-80-for-plugins-frontend-native-i.md |
| b4789c2 | raise below-floor modules | (fresh ticket to be filed for raise-below-floor modules) |
| 78c179f | alpine admin/npc/settings | epic-testing-qa (existing; per open-untriaged.md § 2026-09-25) |
| 55f201f | VN pages/new-chat/quests/worlds | epic-testing-qa (existing; per open-untriaged.md § 2026-09-25) |

**Acceptance Criteria:**

- [ ] The 2 coverage-waiver tickets reviewed and either justified or replaced with module-by-module raise tickets.
- [ ] The 3 frontend batches have at least one smoke test per cluster (admin, npc, settings; VN, new-chat, quests, worlds).
- [ ] coverage-floor gate green; below-floor modules either raised to floor or explicitly waived with documented justification.
- [ ] index.json updated via plan:sync:fix.

**Tags:** coverage, waivers, frontend, alpine, testing-qa
**Related:** .plan/backlog/open-untriaged.md § New clusters, .plan/epics/epic-testing-qa.md, .plan/tickets/TASK-waiver-coverage-floor-below-80-for-plugins-frontend-native-i.md


git issue: 04475df
