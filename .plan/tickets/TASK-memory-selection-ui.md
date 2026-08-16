<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Memory Selection UI

**Status:** ✅ Done (closed via git issue)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-memory-systems

## Summary

Memory selection UI: mid-chat panel, pinning, context window integration. From `epic-memory-systems.md`.

## Scope

### UI Components

- Memory selection panel
- Memory pinning interface
- Context window integration

### Interactions

- Browse available memories
- Pin/unpin memories
- Inject memories into context

### Integration

- Chat context window
- Memory management system

## Linked Epics

- `epic-memory-systems.md`

## Acceptance Criteria

- [x] Memory selection panel in chat
- [x] Memory pinning interface
- [x] Context window integration
- [x] Browse available memories
- [x] Pin/unpin memories
- [x] Inject memories into context
- [x] Unit tests for UI logic
- [x] Integration tests for memory workflow

## Notes

- Reference `epic-memory-systems.md` for full system design
- Shipped on `dev`: pin persistence + injection + panel open (`1fd6514f`); assistant/world tabs populated by `scope` (`5e62eea7`).
- UI logic + workflow covered by `memory-panel.test.ts`, `actor-memories-pin.test.ts`, `actor-memories-scope.test.ts`, `memories-pin.test.ts`, `decide.test.ts`.
