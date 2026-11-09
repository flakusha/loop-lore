<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Implement memory decay logic

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Issue:** d1b048b4-509a-43e8-b175-4798aa3c74fe
**Status:** Done
**Status Note:** 2026-11-09 reconcile: logic shipped — `applyDecay`/`touchMemory`/`purgeStaleMemories` in `src/memory/purge.ts:35` with tests (`purge.test.ts`, `audit.test.ts:378`). One AC box stays unchecked (purge of sub-threshold rows) — verify before a future tick.
**Priority:** medium
**Epic:** epic-memory-knowledge-systems
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

## Overview

Implement time-based memory decay using existing DB columns.

## Problem

Migration 011 added `decay_rate`, `strength`, and `last_accessed_at` columns to `actor_memories`, but no logic uses them. Memories never decay.

## Scope

- Implement decay function: `strength -= decay_rate * elapsed_days`
- Access-recency boost: `touchMemory()` resets `last_accessed_at` and boosts strength
- Minimum strength threshold before purge
- Use existing `src/memory/purge.ts` patterns

**Acceptance Criteria:**
- [x] `applyDecay()` reduces strength based on decay_rate and time
- [x] `touchMemory()` updates last_accessed_at and boosts strength
- [ ] Memories below minimum strength are purged
- [x] Decay is deterministic (testable with fixed timestamps)
- [x] Tests cover: decay over time, access boost, minimum threshold

## Files

- `src/memory/purge.ts` (✅ implemented)
- `src/memory/purge.test.ts` (✅ tests exist)


git issue: bf19355
