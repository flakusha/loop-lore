# TASK: Timeline-aware memory injection

**Status:** Draft
**Priority:** P1 — High
**Epic:** `epic-memory-propagation.md`
**Type:** Feature

## What

Extend memory injection to respect timeline scopes. Memories from one timeline should not leak to another unless explicitly shared.

## Why

Memory Propagation epic requires isolation between timeline branches.

## Implementation

- Extend `src/assistant/prompt/sections/memories.ts` with timeline filtering
- Add `timeline_id` to memory query scope
- Default: only inject memories from current timeline
- GM override: `shareability = 'cross-timeline'` bypasses isolation

## Acceptance Criteria

- [ ] Memory injection filters by active timeline
- [ ] Cross-timeline sharing flag respected
- [ ] Unit tests for isolation boundaries
- [ ] Integration tests for multi-timeline memory injection

## Dependencies

- Timeline selection API (TASK-timeline-selection-api)
- Memory & Knowledge Systems (existing `src/memory/` infrastructure)
