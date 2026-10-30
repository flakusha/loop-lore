<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: timeline in-chat command

**Status:** Done
**Status Note:** [2026-10-30, feat-timeline-remainder] `src/assistant/commands/timeline.ts` registers `/timeline` with `list|fork|switch` subcommands, registered in the barrel (`index.ts`) and advertised via `GET /api/commands` (`commands.timeline` locale keys added additively in all 10 catalogs; frozen `native/loop-lore-egui/command-vectors.json` regenerated). Authorization mirrors the timelines routes: `list` → `requireWorldAccess`; `fork`/`switch` → `requireWorldOwner`. Fork reuses `createWhatIfSimulator().fork` (the world-timeline tooling insert, not the HTTP route). Switch rewrites `chats.timeline_id` — the SHARED generation branch feeding prompt assembly (lore injection scopes to it); the per-user view remains `POST .../timelines/:id/select`. Prime-row switching resolves to the `prime` slug. Deviations: the ticket's "reuse the routes/worlds/timelines.ts service layer" — that file has no extracted service functions (inline route queries), so fork composes the existing `whatif-simulator` fork instead and switch is a direct `chats` update, matching the route's own resolution logic.
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

- [x] `/timeline list|fork|switch` operate on the chat's world timelines — `src/assistant/commands/timeline.ts`
- [x] Switching updates subsequent generation context to the active timeline — `chats.timeline_id` rewrite drives prompt-assembly scoping (lore section reads it via the AssembleChat projection)
- [x] Error paths: no world bound to chat, unknown timeline id — plus no-db, unknown subcommand, missing switch id, and non-owner fork/switch
- [x] Unit tests for the three subcommands + gating (world-scoped authorization) — `src/assistant/commands/timeline.test.ts` (11 tests)

**Resolved:** 2026-10-30 registry-driven close: git issue 0c5128c (registry tip: 15c008ac9 Konstantin Fedotov Close issue)
