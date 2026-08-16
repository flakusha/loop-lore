<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Shared Reputation Schema

**Status**: done
**Priority**: high
**Labels**: schemas, reputation
**Assignee**:
**Epic**: epic-shared-schemas
**Related**: TASK-faction-reputation, TASK-nsfw-reputation-social, TASK-nsfw-reputation-consequences

## Summary

Unified `ReputationScore` / `ReputationModifier` TypeBox schemas shared across reputation consumers.

## Status

Implemented and verified 2026-08-15. Work landed without a ticket (done during shared-schemas epic execution); ticket created retroactively for audit trail.

## Implementation

- `src/validation/schemas.ts` — `ReputationScore` + `ReputationModifier` TypeBox schemas
- `src/schemas/reputation.ts` — unified reputation schema module
- `src/rpg/integration-registry/contracts.ts` — `FactionStanding` contract replaced by unified schema

## Acceptance

- [x] Unified `ReputationScore` defined in `src/validation/schemas.ts`
- [x] Unified `ReputationModifier` defined
- [x] Legacy reputation schema replaced — `src/schemas/reputation.ts`
- [x] `FactionStanding` contract unified — `src/rpg/integration-registry/contracts.ts`
