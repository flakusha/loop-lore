<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Reconcile stale .plan/ status for shipped subsystems

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Multiple epics/tickets advertise Not Started / In progress / Done where the code has moved on. plan:validate cannot catch this. Reconcile in one pass so the plan stops lying.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Each target's **Status:** set to the canonical value (see ticket body for table).
- [ ] epic-achievements.md unchecked ACs either implemented or split into tickets.
- [ ] bun run plan:validate green.

**Related:** .plan/epics/epic-auth-access.md, .plan/epics/epic-api-routes.md, .plan/epics/epic-frontend-emoji-reactions.md, .plan/epics/epic-frontend-chat-commands.md, .plan/epics/epic-frontend-settings.md, .plan/epics/epic-items.md, .plan/epics/epic-inventory.md, .plan/epics/epic-achievements.md, .plan/epics/epic-skills.md, .plan/backlog/priority-p0-p2.md
