# TASK: Wire trustModifier from Relationships into Memory Provision

**Issue:** d1f2a3b4-c5e6-7890-abcd-ef1234567890
**Status:** open
**Priority:** medium
**Epic:** epic-memory-knowledge-systems

## Overview

Wire trustModifier from character relationships into the memory provision pipeline to enable trust-augmented memory sharing probability.

## Problem

`src/memory/provision.ts` supports `trustModifier` in `ProvisionContext`, but `src/assistant/prompt/sections/memories.ts` does not pass it when building the context. The `evaluateShareability` function in `shareability.ts` uses `trustModifier` to shift sharing probability based on relationship state.

## Gap Analysis

- `ProvisionContext.trustModifier` exists but is never set in `buildProvisionContext()`
- `RelationshipsService.getRelationship()` provides trust (-100 to +100) between characters
- Trust should be normalized to -1..+1 range for the provision algorithm

## Scope

- [ ] Add `trustModifier` parameter to `buildProvisionContext()` in memories.ts
- [ ] Query `RelationshipsService` for trust between actor and each participant
- [ ] Average trust values from all participants to get the trustModifier
- [ ] Normalize trust (-100..100) → trustModifier (-1..1) using `trust / 100`
- [ ] Write unit test for trust-augmented memory provision

## Acceptance Criteria

- [ ] Private memories respect participant trust level
- [ ] Secret memory sharing probability adjusted by relationship trust
- [ ] Test: high-trust participant sees secret memory more often
- [ ] Test: low-trust participant withheld from secret memory

## Files

- `src/assistant/prompt/sections/memories.ts` (modify)
- `src/characters/services/relationships-service.ts` (read-only)
- `src/memory/provision.test.ts` (extend)

## Related

- TASK-memory-provision-wiring.md — parent wiring task
- TASK-character-mood-happiness.md — mood affects sharing
- TASK-character-memory-injection.md — full injection probability model
