# TASK: Format Version Migration Logic

**Status:** ⬜ Not Started
**Priority:** Medium (deferred — not required until schema evolution)
**Effort:** Medium
**Epic:** Data Integrity (Phase 3)
**Tags:** db, migration, format-version, data-migration
**Spec:** `src/db/migrations/006_data_version_columns.ts`, `src/db/data-migrations/`

## Summary

Implement format version migration logic that runs when `format_version < current_version` on read. Enables evolving data schemas (e.g., settings JSON v1→v2) without breaking existing records.

## Rationale

- `format_version` columns exist on Users, Personas, Actors, Messages (default 0)
- When data format changes (new fields, renamed fields, changed types), bump the version
- App detects stale records and runs migration on read
- Separate from optimistic locking (high-load concern)

## Current State

- `format_version` columns exist on all core tables (default 0)
- `data_migrations` table tracks applied migrations (table_name, from_version, to_version)
- `src/db/data-migrations/` has stub v1_to_v2 files for each table
- `src/db/optimistic-locking.ts` exists but not needed yet

## Architecture

### Read Path

```
App reads record → format_version = 0
  ↓
Check: format_version < CURRENT_VERSION?
  ↓ Yes
Run migration: v0→v1, v1→v2, ...
  ↓
Update record with new format_version
  ↓
Return migrated record
```

### Migration Registration

```typescript
// src/db/data-migrations/registry.ts
export const MIGRATIONS = {
  users: [
    { from: 0, to: 1, migrate: migrateUsersV0ToV1, },
  ],
  personas: [
    { from: 0, to: 1, migrate: migratePersonasV0ToV1, },
  ],
  // ...
};
```

### Migration Function Signature

```typescript
type DataMigration = (row: Record<string, unknown>,) => Record<string, unknown>;

function migrateUsersV0ToV1(row: Record<string, unknown>,): Record<string, unknown> {
  // Transform settings JSON format
  return { ...row, settings: transformSettings(row.settings,), format_version: 1, };
}
```

## Tasks

### Phase 1: Registry & Runner

- [ ] Create `src/db/data-migrations/registry.ts` — migration registry
- [ ] Create `src/db/data-migrations/runner.ts` — runs migrations on read
- [ ] Add `CURRENT_VERSION` constants per table
- [ ] Unit tests for migration runner

### Phase 2: Integration

- [ ] Wire runner into `src/chat/service.ts` (chat reads)
- [ ] Wire runner into `src/routes/characters.ts` (actor reads)
- [ ] Wire runner into `src/routes/settings.ts` (user reads)
- [ ] Wire runner into `src/personas/service.ts` (persona reads)

### Phase 3: First Real Migration

- [ ] Implement `migrateUsersV0ToV1` — settings JSON format change
- [ ] Update `src/db/data-migrations/users/v1_to_v2.ts` with real logic
- [ ] Integration tests for migration path

## Files to Create

- `src/db/data-migrations/registry.ts` — migration registry
- `src/db/data-migrations/runner.ts` — migration runner

## Files to Modify

- `src/chat/service.ts` — wire migration runner on chat reads
- `src/routes/characters.ts` — wire migration runner on actor reads
- `src/routes/settings.ts` — wire migration runner on user reads
- `src/personas/service.ts` — wire migration runner on persona reads

## Acceptance Criteria

- [ ] Migration runner detects stale `format_version` on read
- [ ] Migrations run in order (0→1→2→...)
- [ ] Migrated records saved with updated `format_version`
- [ ] No migration runs if `format_version` already current
- [ ] Unit tests cover migration path
- [ ] Integration tests verify end-to-end migration

## Risk

Low — additive feature. Migrations only run when needed. Can be deferred indefinitely until schema actually evolves.

## Notes

- This is NOT optimistic locking (that's separate epic for high-load)
- This is NOT schema migration (that's Kysely migrations)
- This IS data format evolution (settings JSON, persona fields, etc.)
