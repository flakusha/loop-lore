<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: timeline in-chat command

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-timeline-system
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add `/timeline` in-chat command (list/fork/switch scoped to the chat's world)
so world timelines are not world-detail-page-only. Source: assistant
integration review 2026-10-23 (gap 7 / rec 7).

**Context:**

Timeline branching UI (G2) shipped as a fixed flow:
`GET/POST /api/worlds/:id/timelines` (`routes/worlds/timelines.ts`),
`world-detail.html:38-40` + `world-timeline-bar.ts:41`. Chat branch commands
exist, but world-timeline fork/switch (`story/whatif-simulator.ts:fork`,
`event-steering.ts`) has no chat-surface entry.

**Approach**

- New `src/assistant/commands/timeline.ts` with subcommands:
  `/timeline list` (chat's world timelines), `/timeline fork [label]`,
  `/timeline switch <id>`.
- Reuse the `routes/worlds/timelines.ts` service layer, not the HTTP route.
- Pair with `TASK-timeline-branching-ui.md` (fixed-flow UI, same epic).

**Acceptance Criteria:**

- [ ] `/timeline list|fork|switch` operate on the chat's world timelines
- [ ] Switching updates subsequent generation context to the active timeline
- [ ] Error paths: no world bound to chat, unknown timeline id
- [ ] Unit tests for the three subcommands + gating (world-scoped authorization)
