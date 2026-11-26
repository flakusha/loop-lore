<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Multi-agent orchestration (turn queue)

**Overview:** (see sections below)

**Status:** In Progress
**Status Note:** Landed slice awaits operator landing on branch `orchestration-queue` (tip 46ad3524d); filed 2026-11-12 because grep over `.plan/epics` found no epic owning this subsystem — the queue work had been scoped from `epic-harness-integration.md` + theme-1 instead
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** orchestration, multi-agent, turn-queue, harness, subagents, parallelism

## Summary

Owns the multi-agent orchestration subsystem: assistant-class participant turns
plus detached-job parallelism (sequential turn assignment, CrewAI-style
parallel computation). Distinct from the shipped character turn selection in
`src/group-chat/turn-selector.ts`. Deferred until subagent-branch runs
(Option C) exist; no multi-assistant code exists today.

## Tickets

| Ticket | Scope | Status |
|--------|-------|--------|
| `TASK-harness-multi-agent-turn-queue.md` | Assistant participant turns + detached-job parallelism (deferred until Option C) | Not Started |

Cross-links: listed in `epic-harness-integration.md` (dependency row,
line 535) and derived scope recorded on branch `orchestration-queue` (tip
46ad3524d), landed-slice awaiting operator landing.

## Relationship to epic-harness-integration

The harness-integration epic carries orchestration-adjacent tags and the turn-queue
dependency row, but has never had a dedicated orchestration epic; this file
becomes the subsystem owner going forward. epic-harness-integration keeps the
integration-facing slices; subsystem-level queue/orchestration work links here.

## Definition of Done

- Operator lands `orchestration-queue` (or it is superseded with a note here).
- Turn-queue ticket status reflects landed reality.
- `bun run plan:validate` green.


git issue: fbf71e8
