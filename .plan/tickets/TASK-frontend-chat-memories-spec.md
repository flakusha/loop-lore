<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend Chat Memory Panel Implementation

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Status Note:** 2026-11-09 reconcile: panel shipped — `src/components/chat/memory-panel.html` (character/assistant/world/audit tabs, create form, token budget display), pin/injection/selection (`src/frontend/alpine/memory-panel*.ts`), toggle (`chat-header.html:62`), routes + tests (`actor-memories-pin.test.ts`, `memory-panel.test.ts`). Spec linked from `docs/frontend/chat/memories.md`.
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability
**Related:** docs/frontend/chat/memories.md
**git issue:** 2f6424b

## Summary

Implement the in-chat memory panel, memory selection/carry-forward UI, and
limits/auto-purge indicators per `docs/frontend/chat/memories.md` — currently an
untracked spec (no `.plan/` ticket or epic references it).

## Context

`docs/frontend/chat/memories.md` defines the UX but has **zero** `.plan/`
linkage (discovered during docs↔planning audit). Spec covers: memory types,
creation flow, selection & carry-forward, memory panel, limits & auto-purge, and
world memories. Backend memory services exist (`TASK-memory-*` tickets) but the
frontend panel surface is not tracked against this spec.

## Acceptance Criteria

- [x] Memory panel renders memory types + creation flow per spec
- [x] Selection & carry-forward UI matches spec
- [x] Limits/auto-purge indicators shown
- [x] World-memory surface handled
- [x] `bun run check` green; manual UI smoke pass
- [x] Ticket linked from `docs/frontend/chat/memories.md`
