# TASK: Reconcile Achievement Unlock Sources

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-replayability

## Summary

Resolve the data-model dedup where `achievements_unlocked` is represented 3 ways (`player_achievements` rows, `playthroughs` int count, `meta_progression` JSON array) and `secrets_found` 2 ways. Make `player_achievements` the source of truth and derive `meta_progression`/`playthrough` counts from it, dropping redundant JSON/int-count duplication. Prerequisite: this runs AFTER TASK-wire-achievements-routes and TASK-wire-replayability-routes are wired.

## Acceptance Criteria

- [ ] `player_achievements` is the single source of truth for unlock state
- [ ] `meta_progression` / `playthroughs` counts derived from `player_achievements`; redundant JSON/int-count duplication removed
- [ ] `secrets_found` represented once
- [ ] Backed by tests (bun:test, `createTestDb` + `src/test-utils/insert-helpers.ts`)

## Linked Epics

- `epic-replayability.md`
