<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant /analyze slash command over prompt-analysis service

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-prompt-improvement

## Summary

analyzePrompt in src/prompt-improve/service.ts plus analyze mode in POST /api/generation/prompt already ship, but no slash command exposes them. Add runAnalyze mirroring runImprove, register /analyze, stub-complete tests.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Implemented in tree/prompt-power-batch: `src/assistant/commands/analyze.ts` — `runAnalyze` over `analyzePrompt` with injectable `analyze` dep (tests stub it; bare contexts degrade to an unavailable notice, never touch the draft). Registered in `commands/index.ts`. 4 tests green (`analyze.test.ts`).
