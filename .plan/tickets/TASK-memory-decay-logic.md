<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Implement memory decay logic

**Issue:** d1b048b4-509a-43e8-b175-4798aa3c74fe
**Status:** open
**Priority:** medium
**Epic:** epic-memory-knowledge-systems

## Overview

Implement time-based memory decay using existing DB columns.

## Problem

Migration 011 added `decay_rate`, `strength`, and `last_accessed_at` columns to `actor_memories`, but no logic uses them. Memories never decay.

## Scope

- Implement decay function: `strength -= decay_rate * elapsed_days`
- Access-recency boost: `touchMemory()` resets `last_accessed_at` and boosts strength
- Minimum strength threshold before purge
- Use existing `src/memory/purge.ts` patterns

## Acceptance Criteria

- [x] `applyDecay()` reduces strength based on decay_rate and time
- [x] `touchMemory()` updates last_accessed_at and boosts strength
- [ ] Memories below minimum strength are purged
- [x] Decay is deterministic (testable with fixed timestamps)
- [x] Tests cover: decay over time, access boost, minimum threshold

## Files

- `src/memory/purge.ts` (✅ implemented)
- `src/memory/purge.test.ts` (✅ tests exist)
