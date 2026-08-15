# TASK: Shared NSFW Rating Schema

**Status**: done
**Priority**: high
**Labels**: schemas, nsfw, rating
**Assignee**:
**Epic**: epic-shared-schemas
**Related**: TASK-nsfw-rating-enforcement

## Summary

Unified `NSFWRatingEnforcement` / content rating TypeBox schemas shared across NSFW rating consumers.

## Status

Implemented and verified 2026-08-15. Work landed without a ticket (done during shared-schemas epic execution); ticket created retroactively for audit trail.

## Implementation

- `src/validation/schemas.ts` — `NSFWRatingEnforcement` TypeBox schema
- `src/schemas/nsfw-rating.ts` — unified NSFW rating schema module (`isRatingAllowed` + `createRatingEnforcement` canonical home)
- `src/schemas/nsfw-rating.test.ts` — unit tests (severity model, effective limit, enforcement)

## Acceptance

- [x] Unified `NSFWRatingEnforcement` defined in `src/validation/schemas.ts`
- [x] Content rating enforcement integrated — `src/schemas/nsfw-rating.ts` (canonical)
