<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Npc Plan Revision

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Dynamic plan adjustment on goal-achieved / goal-blocked / new-opportunity / external-event / mood-shift, writing `actor_plan_revisions` rows (migration 011, shipped).

**Context:** Revision storage exists; `src/services/agency/bdi-reflection.ts` (`applyReflectionCheckpoint`) emits revisions on priority shifts. Remaining work is the live revision trigger (event-driven, not just nightly) plus revision-vs-full-replan policy.

**Acceptance Criteria:**

- [ ] Live trigger revises the active plan and writes a revision row (test).
- [ ] Revision-vs-replan threshold documented in-ticket and enforced.
- [ ] `bun run check` green.
