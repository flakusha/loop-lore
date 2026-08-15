# TASK: Shared Schema Migration

**Status**: done
**Priority**: medium
**Labels**: schemas, migration, db
**Assignee**:
**Epic**: epic-shared-schemas
**Related**: TASK-schema-validation

## Summary

DB migration plumbing for the unified shared schemas (reputation, consent, NSFW rating) — column/table adjustments plus downstream schema regeneration.

## Status

Implemented and verified 2026-08-15 (schema sync green — `db:schemas:check`). Work landed without a ticket (done during shared-schemas epic execution); ticket created retroactively for audit trail.

## Implementation

- Migration adjustments for reputation/consent/NSFW-rating storage
- `bun run db:sync-types && bun run db:sync-manifest` — regenerated schema artifacts

## Acceptance

- [x] Migrations updated for shared schemas
- [x] Downstream schema artifacts regenerated (`src/db/schema-*.ts`, `schema-manifest.ts`)
- [x] `db:schemas:check` green
