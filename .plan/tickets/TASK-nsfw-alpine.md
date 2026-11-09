<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW Alpine.js Logic

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** P0 — Critical
**Effort:** Medium
**Type:** Feature Task
**Tags:** nsfw, frontend, alpine, logic
**Epic:** epic-nsfw-ui
**Also Linked:** epic-frontend-backend-integration.md
**Superseded By:** TASK-nsfw-frontend-integration.md (comprehensive integration task)

## Summary

Alpine.js state management for NSFW system.

## Core Features

- Intimacy state
- Body state management
- Housing state
- Scene progression

## Acceptance Criteria

- [x] Intimacy state management (mixins `src/frontend/alpine/nsfw-intimacy`, `nsfw-panel`, `nsfw-body` via `inline-state.ts`, 2026-11-09)
- [x] Body state tracking (`nsfw-body` mixin + widget, shipped)
- [x] Housing state management (NSFW slice: gated `fetchLocationConfig` + suitability view `src/frontend/nsfw/private-space.ts`; full housing in `epic-housing`, 2026-11-09)
- [x] Scene progression logic (reducer `src/frontend/nsfw/intimacy-scene.ts` + position step, 2026-11-09)
- [ ] SSE updates (no intimacy SSE contract exists; `continueIntimacy` re-pulls pairs — interim path)

## Files to Create

- `src/frontend/alpine/nsfw.ts`
