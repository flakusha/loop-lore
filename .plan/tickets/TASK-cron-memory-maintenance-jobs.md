<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

## TASK: Periodic memory decay + purge jobs

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Small
**Epic:** epic-cron-scheduler
**Related:** TASK-cron-registry-core

## Summary

Give `applyDecay` / `purgeStaleMemories` (`src/memory/purge.ts`) their first
periodic callers as config-gated cron jobs.

## Context

Purge service is complete but event-starved: nothing invokes decay/purge on a
cadence, so `strength` never fades and stale memories accumulate. Purge
supports soft-mark (confidence → 0.01) and hard-delete paths; the job must
default to the safe one.

## Acceptance Criteria

- [ ] `memory.decay` (`@hourly`) runs `applyDecay`; logs `affected` count
- [ ] `memory.purge` (`@daily`) runs `purgeStaleMemories` soft-mark by default;
  `hardDelete: true` only via explicit config, documented as destructive
- [ ] Both jobs config-gated (`enabled` default: decay on, purge on-soft);
  thresholds (`staleAfterChats`, `minConfidence`, `minStrength`) exposed
- [ ] Purge job emits counts via structured log; dry-run option (`runOnce`
  reporting would-be-affected without writing) if cheap, else skip
- [ ] `bun run check` green
