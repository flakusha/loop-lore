# TASK: Timescape-Aware Memory

**Epic:** `epic-memory-knowledge-systems.md` (FEA-2026-058)
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started

## Summary

Convert memory timestamps to game-time, add timeline-specific memory recall, and implement time-based decay per game-day.

## Requirements

### Timescape Integration

| Memory Field | Time System    | Integration                                                      |
| ------------ | -------------- | ---------------------------------------------------------------- |
| `timestamp`  | World time     | Store as game-time, not real-time                                |
| `timestamp`  | Timeline system| Link to `timeline_id` for timeline-specific memories             |
| `decay_rate` | Time scale     | Decay per game-day, not real-day                                 |
| `duration`   | Time progression| `permanent` memories survive time compression                   |

### Timeline Integration

- Memories tagged with `timeline_id` for timeline-specific recall
- Cross-timeline memories (GM-created lore) can propagate per `epic-memory-propagation.md` rules
- Time compression (e.g., 1 game-hour = 1 real-minute) affects decay rates proportionally

## Tasks

- [ ] Convert memory timestamps to game-time
- [ ] Add `timeline_id` field to memories
- [ ] Migration: add `timeline_id` column to `actor_memories` table
- [ ] Update `db:sync-types` and `db:sync-manifest`
- [ ] Implement time-based decay (per game-day)
- [ ] Implement timeline-specific memory recall
- [ ] Handle time compression for decay rates
- [ ] Tests: game-time timestamps, timeline recall, decay behavior

## Dependencies

- `epic-timeline-system.md` (timeline_id column, timeline branching)
- `epic-time-scale.md` (game-time progression, time compression)
- `epic-memory-propagation.md` (cross-timeline memory scopes)

## Acceptance Criteria

- [ ] Memory timestamps are game-time
- [ ] `timeline_id` field on memories
- [ ] Migration applied
- [ ] Time-based decay working
- [ ] Timeline-specific recall working
- [ ] Time compression handled
- [ ] Tests pass
