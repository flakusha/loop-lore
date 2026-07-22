# TASK: Wire memory provision into prompt assembly

**Issue:** 3bfb101
**Status:** open
**Priority:** high
**Epic:** EPIC-2026-37

## Overview

Connect the memory provision module to the prompt assembly pipeline.

## Problem

`src/memory/provision.ts` implements privacy-aware, scope-aware, budget-constrained memory filtering, but the prompt assembly pipeline (`src/assistant/prompt/sections/memories.ts`) still uses keyword-only filtering.

## Scope

- Replace keyword-based memory injection with `provisionMemories()`
- Pass `ProvisionContext` from chat context (viewerId, worldId, trustModifier)
- Ensure token budget from context window is respected
- Test: private memories not injected for non-owner viewers

## Acceptance Criteria

- [ ] `src/assistant/prompt/sections/memories.ts` calls `provisionMemories()`
- [ ] Private memories only injected for owner
- [ ] Secret memories respect shareability config
- [ ] Token budget from context window limits memory injection
- [ ] Existing memory tests still pass

## Files

- `src/assistant/prompt/sections/memories.ts` (modify)
- `src/memory/provision.ts` (read-only)
- `src/memory/provision.test.ts` (may extend)
