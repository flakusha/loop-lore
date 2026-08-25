<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NPC Movement Indicator in Chat

**Status:** ✅ Done — service + route + message metadata column (migration 042) + frontend types shipped (`4809f056`, `c76b0ef5`); lint/typecheck cleanup `44e22069`
**Priority:** high
**Effort:** Medium

## Summary

Persist NPC movement events in message metadata and render movement indicators in chat UI. Backend: store movement events (actorId, fromLocationId, toLocationId, pattern) in message metadata JSON field. Frontend: display movement events as distinct visual indicators in chat message stream.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated


git issue: f9b5586
