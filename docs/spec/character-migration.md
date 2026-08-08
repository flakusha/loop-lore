# Character Migration Specification

**Status:** Draft
**Date:** 2026-07-28
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

Defines detailed migration paths between character specification versions. The character-spec.md mentions migration at a high level; this document defines the concrete migration mechanics, validation gating, rollback procedures, and data integrity guarantees.

---

## 1. Migration State Machine

### States

| State               | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `current`           | Character is at the latest spec version               |
| `pending_migration` | Character is queued for migration to the next version |
| `migrating`         | Migration in progress (background job)                |
| `migrated`          | Migration completed successfully                      |
| `migration_failed`  | Migration failed; requires manual intervention        |
| `rolled_back`       | Migration was reverted due to failure or admin action |

### Transitions

```
current ──(scheduled)──▶ pending_migration ──(started)──▶ migrating
                                            │
                            (failed) ◀─────┘
                                            │
                            (completed)──▶ migrated ──(revert)──▶ rolled_back
```

### Transition Guards

| Transition                               | Guard                                             |
| ---------------------------------------- | ------------------------------------------------- |
| `current` → `pending_migration`          | Target version must be newer and compatible       |
| `pending_migration` → `migrating`        | No other migration in flight for this character   |
| `migrating` → `migrated`                 | All migration steps passed validation             |
| `migrating` → `migration_failed`         | Any validation step failed                        |
| `migration_failed` → `pending_migration` | Admin retry after fix                             |
| Any → `rolled_back`                      | Admin action or auto-rollback on critical failure |

---

## 2. Migration Types

### 2.1 Additive Migration

Adds new fields with defaults. Always safe, no data loss.

Example: Adding `data_source_format` column to `actors` table:

- New column added with `DEFAULT ''`
- Existing characters get empty string as default
- No backfill needed

### 2.2 Transformative Migration

Changes existing data format or semantics. Requires data transformation.

Example: Converting boolean integer flags to typed state enums:

- Existing `true`/`false` → mapped to `Active`/`Inactive` enum values
- Migration must be idempotent (can be re-run safely)
- Requires `down()` function to reverse the transformation

### 2.3 Destructive Migration

Removes fields or tables. Irreversible without backup.

Example: Dropping deprecated `legacy_settings` column:

- Data is copied to audit log before removal
- 30-day retention of backup data before permanent deletion
- Requires explicit admin confirmation

---

## 3. Migration Validation

### Per-Migration Checks

| Check                     | Description                                 | Failure Action |
| ------------------------- | ------------------------------------------- | -------------- |
| Schema parity             | DB schema matches migration output          | Rollback       |
| Row count parity          | Row counts match pre/post migration         | Rollback       |
| Column parity             | Expected columns exist and match types      | Rollback       |
| Data integrity            | Foreign key constraints satisfied           | Rollback       |
| Application compatibility | Application code works with migrated schema | Rollback       |
| Sample data spot-check    | Random samples validated for correctness    | Rollback       |

### Batch Migration Checks

For migrations affecting many characters simultaneously:

| Check                | Description                              |
| -------------------- | ---------------------------------------- |
| Migration batch size | Max 1000 characters per batch            |
| Batch pause between  | 1-second pause between batches           |
| Health check         | System health monitored during migration |
| Rollback trigger     | Auto-rollback if error rate > 1%         |

---

## 4. Migration Execution

### API Endpoints

| Method | Path                                 | Description                                           |
| ------ | ------------------------------------ | ----------------------------------------------------- |
| POST   | `/api/admin/migrations/trigger`      | Trigger a migration for a specific character or batch |
| GET    | `/api/admin/migrations/:id`          | Get migration status and progress                     |
| POST   | `/api/admin/migrations/:id/retry`    | Retry a failed migration                              |
| POST   | `/api/admin/migrations/:id/rollback` | Rollback a completed migration                        |
| GET    | `/api/admin/migrations/history`      | List recent migrations with status                    |

### Migration Execution Flow

```
1. Admin triggers migration for character batch
2. System validates target version compatibility
3. For each character in batch:
   a. Create migration_review record
   b. Apply migration steps in order
   c. Validate post-migration state
   d. Update character.migration_status
4. If any character fails:
   a. Log failure with details
   b. Rollback affected characters
   c. Notify admin
5. If all succeed:
   a. Mark batch as complete
   b. Update schema_version in DB
```

---

## 5. Rollback Procedures

### Automatic Rollback Triggers

| Trigger                  | Response Time                             |
| ------------------------ | ----------------------------------------- |
| Migration script error   | Immediate (character-level)               |
| Validation failure       | Immediate (character-level)               |
| Error rate > 1% in batch | Batch pause + admin notification          |
| DB constraint violation  | Immediate rollback for affected character |

### Rollback Process

1. Set `migration_status` → `rolling_back`
2. Execute the `down()` function from the migration file
3. Validate post-rollback schema matches pre-migration state
4. Set `migration_status` → `rolled_back`
5. Log rollback details for audit trail
6. Notify admin with summary of affected characters

---

## 6. Audit Trail

All migrations produce an audit record:

```typescript
interface MigrationAuditRecord {
  id: string;
  migration_id: string; // FK to migration definition
  character_id: string; // FK to actor
  from_version: string; // Schema version before
  to_version: string; // Schema version after
  status: "started" | "completed" | "failed" | "rolled_back";
  started_at: timestamp;
  completed_at?: timestamp;
  error_detail?: string; // JSON string of error if failed
  performed_by: actor_id; // Admin who triggered it
  rollback_reason?: string; // If rolled back, why
}
```

## Cross-References

- `docs/spec/character-spec.md` — character spec that these migrations update
- `docs/spec/schema.md` — DB schema versioning and migration format
- `src/db/migrations/` — migration files that implement the `down()` functions
- `.plan/backlog/open.md` — current migration fixes (template_injection, schema-sync)
- `.plan/tickets/TASK-data-migration-transitivity.md` — transitivity tracking for migration states
