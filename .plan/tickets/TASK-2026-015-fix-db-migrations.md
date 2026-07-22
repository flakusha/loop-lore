# TASK: Fix DB Migration Test Failures

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Med
**Epic:** epic-testing-qa

## Summary

3 DB/migration tests fail in isolation: missing `down()` for migrations 024 and 025, and schema sync manifest vs DB mismatch.

## Current State

Tests in `src/db/` (3 failures):

| Failure                           | Cause                                                          |
| --------------------------------- | -------------------------------------------------------------- |
| Migration 024 (encryption_level)  | Missing `down()` — cannot rollback                             |
| Migration 025 (character_systems) | Missing `down()` — cannot rollback                             |
| Schema sync                       | Manifest lists tables/columns that don't match actual DB state |

## Tasks

- [ ] Add `down()` rollback functions to migration 024 (`024_encryption_level.ts`)
- [ ] Add `down()` rollback functions to migration 025 (`025_character_systems.ts`)
- [ ] Fix schema sync test — either update manifest to match DB or fix test expectations
- [ ] Run `bun test src/db/` — verify 0 failures
- [ ] Ensure down migrations are correct (test round-trip: up → down → verify clean state)

## Acceptance Criteria

- [ ] All DB migration tests pass
- [ ] Every migration has both `up()` and `down()` functions
- [ ] Schema sync test passes (manifest matches DB state)

## Files

- `src/db/migrations/024_encryption_level.ts` — needs `down()`
- `src/db/migrations/025_character_systems.ts` — needs `down()`
- `src/db/schema.ts` — schema sync manifest
