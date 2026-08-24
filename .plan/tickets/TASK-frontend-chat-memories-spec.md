<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend Chat Memory Panel Implementation

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
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

- [ ] Memory panel renders memory types + creation flow per spec
- [ ] Selection & carry-forward UI matches spec
- [ ] Limits/auto-purge indicators shown
- [ ] World-memory surface handled
- [ ] `bun run check` green; manual UI smoke pass
- [ ] Ticket linked from `docs/frontend/chat/memories.md`
