<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Npc Planning Loop

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Daily planning + task decomposition loop writing `actor_daily_plans` / `actor_planned_activities` (migration 011, shipped). Supersedes the planning slice of the `TASK-npc-bdi-planning` sketch; reaction/revision/buffer slices live in their own tickets.

**Context:** Tables exist; `src/services/agency/bdi-nightly.ts` runs the nightly cycle. Remaining work is the daytime planning pass (wake → daily plan → hourly blocks → subtasks) dispatched by the story-auto-drive scheduler once it lands.

**Acceptance Criteria:**

- [ ] Daytime planning pass writes plans readable by the nightly reflection cycle.
- [ ] Idempotent re-run for the same actor-day (no duplicate plans).
- [ ] `bun run check` green.
