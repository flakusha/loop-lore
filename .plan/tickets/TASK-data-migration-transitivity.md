<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Data Migration Transitivity Tracking

**Epic:** Data Integrity & ACID Guarantees
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started
**Source:** `.tmp/loop-lore-ideas.md` line 134 — data transitivity flags/states

## Summary

Track data lifecycle state during migrations beyond just version numbers. Add explicit
transitivity states to know when data is migrated but not yet validated, validated,
or in legacy status — enabling safe rollback, validation gating, and migration
progress tracking.

## Rationale

- `data_version` columns (Epic 34) track optimistic concurrency but not migration lifecycle
- Operators need to know: migrated-but-not-validated → can't trust data yet
- Validation may fail — need "legacy" state to indicate rollback path existed
- Migration orchestration (Epic 33) needs state-aware coordination

## Design

### Migration States

```typescript
type MigrationState =
  | "legacy" // Original format, pre-migration
  | "migrating" // In-progress transition
  | "migrated" // Transformed, not validated
  | "validated" // Migrated + passed integrity checks
  | "failed"; // Validation failed, requires manual intervention

interface DataTransitivity {
  table_name: string;
  row_id: string;
  state: MigrationState;
  migrated_at?: Date;
  validated_at?: Date;
  version_from?: number;
  version_to?: number;
  signature?: string; // Hash of migrated data for integrity
}
```

### Integration Points

- **Epic 34**: Migration states inform optimistic-concurrency conflict handling
- **Epic 33**: Migration leader checks transitivity before proceeding
- **DB Layer**: Query filters can exclude unvalidated migrated data

## Tasks

- [ ] Design migration state enum + add to DB schema
- [ ] Implement state tracking in migration pipeline
- [ ] Add validation hooks per table
- [ ] Add state-aware conflict resolution in write path
- [ ] Add migration state queries to admin API
- [ ] Write tests for state transitions

## Files

- `src/db/schema-migration.ts` — state columns
- `src/db/migrations/` — state transition logic
- `src/services/migration-tracker.ts` — state management
- `src/routes/admin/migrations.ts` — state queries

## Risk

Medium — adds migration state management complexity. State drift between
nodes may occur during multi-instance migrations. Need clear recovery
path and validation before promoting to "validated" state.

## Related

- TASK-state-management-mode-transitions.md — general state machine pattern
- Epic 34 (Data Integrity) — optimistic concurrency
- Epic 33 (Multi-Instance Reconciliation) — migration leadership
