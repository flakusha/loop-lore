<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Shared Consent Schema

**Status**: done
**Priority**: high
**Labels**: schemas, consent, nsfw
**Assignee**:
**Epic**: epic-shared-schemas
**Related**: TASK-nsfw-consent-integration

## Summary

Unified `ConsentState` / `ConsentUpdateBody` TypeBox schemas shared across NSFW consent consumers.

## Status

Implemented and verified 2026-08-15. Work landed without a ticket (done during shared-schemas epic execution); ticket created retroactively for audit trail.

## Implementation

- `src/validation/schemas.ts` — `ConsentState` + `ConsentUpdateBody` TypeBox schemas
- `src/schemas/consent.ts` — unified consent schema module
- `src/middleware/nsfw-gate/consent.ts` — consent gate consumes unified schema

## Acceptance

- [x] Unified `ConsentState` defined in `src/validation/schemas.ts`
- [x] `ConsentUpdateBody` schema defined
- [x] Existing consent fields replaced — `src/schemas/consent.ts`
