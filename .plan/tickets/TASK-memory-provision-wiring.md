<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire memory provision into prompt assembly

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Issue:** 3bfb101c-e553-4879-b239-a817bc68a83f
**Status:** Done
**Status Note:** 2026-11-09 reconcile: shipped — `src/assistant/prompt/sections/memories.ts:26,76` calls `provisionMemories` with `buildProvisionContext` (participants, trust, timeline, party lineage); `trustModifier` computed via `computeTrustModifier` (`memories-helpers.ts:75`).
**Priority:** high
**Epic:** epic-memory-knowledge-systems
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

## Overview

Connect the memory provision module to the prompt assembly pipeline.

## Problem

`src/memory/provision.ts` implements privacy-aware, scope-aware, budget-constrained memory filtering, but the prompt assembly pipeline (`src/assistant/prompt/sections/memories.ts`) still uses keyword-only filtering.

## Scope

- Replace keyword-based memory injection with `provisionMemories()`
- Pass `ProvisionContext` from chat context (viewerId, worldId, trustModifier)
- Ensure token budget from context window is respected
- Test: private memories not injected for non-owner viewers

**Acceptance Criteria:**
- [x] `src/assistant/prompt/sections/memories.ts` calls `provisionMemories()`
- [x] Private memories only injected for owner
- [x] Secret memories respect shareability config
- [x] Token budget from context window limits memory injection
- [x] Existing memory tests still pass

## Files

- `src/assistant/prompt/sections/memories.ts` (modify)
- `src/memory/provision.ts` (read-only)
- `src/memory/provision.test.ts` (may extend)


git issue: 90378a1
