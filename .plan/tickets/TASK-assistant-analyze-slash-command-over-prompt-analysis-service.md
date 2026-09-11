<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Assistant /analyze slash command over prompt-analysis service

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-prompt-improvement

## Summary

analyzePrompt in src/prompt-improve/service.ts plus analyze mode in POST /api/generation/prompt already ship, but no slash command exposes them. Add runAnalyze mirroring runImprove, register /analyze, stub-complete tests.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
