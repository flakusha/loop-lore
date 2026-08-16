<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Split `src/generation/generate-route.ts` (736L)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-code-quality

## Summary

Split `src/generation/generate-route.ts` into pipeline steps under `src/generation/steps/`. Current file mixes orchestration, provider calls, and persistence.

## Target Structure

```
src/generation/steps/
  build-prompt.ts     # prompt construction
  call-provider.ts    # LLM provider dispatch
  stream-client.ts    # stream handling
  persist.ts          # result persistence
  post-process.ts     # post-processing transforms
index.ts              # barrel: re-export steps
```

`src/generation/generate-route.ts` becomes a thin orchestrator importing from steps.

## Acceptance Criteria

- [ ] Each step file < 150 lines
- [ ] `generate-route.ts` < 80 lines (thin orchestrator)
- [ ] `bun run typecheck` passes after split
- [ ] All existing generation tests pass
- [ ] No behavior change (pure refactor)

## Files

- `src/generation/generate-route.ts` → refactor into `src/generation/steps/`
