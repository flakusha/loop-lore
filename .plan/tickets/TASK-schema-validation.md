# TASK: Shared Schema Validation

**Status**: done
**Priority**: medium
**Labels**: schemas, validation
**Assignee**:
**Epic**: epic-shared-schemas
**Related**: TASK-schema-migration

## Summary

Validation coverage for the unified shared schemas — runtime schema checks wired into the validation layer so reputation/consent/NSFW-rating consumers validate against one definition.

## Status

Implemented and verified 2026-08-15. Work landed without a ticket (done during shared-schemas epic execution); ticket created retroactively for audit trail.

## Implementation

- Elysia `t` (TypeBox) schemas in `src/validation/schemas.ts` consumed by route validation
- Schema drift guard passes (`check-db-schemas` + `check-schemas` gates)

## Acceptance

- [x] Shared schemas exercised through route validation
- [x] Validation gates green
