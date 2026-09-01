<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Example dialogue (mes_example few-shot) never injected; includeExamples never set

**Status:** [OK] Done
**Priority:** high
**Effort:** Medium

## Summary

examplesSection.enabled needs ctx.params.includeExamples (default false); no caller in src passes it. Character mes_example never injected as few-shot. Enable by default or pass includeExamples from generate routes.

## Acceptance Criteria

- [x] Implementation complete — wired `includeExamples` through `BuildPromptOpts` and `GenerateRequest`; defaults to `true` for chat-reply so SillyTavern `mes_example` actually reaches the LLM. VN/GM callers retain their explicit `false` overrides.
- [x] Tests passing — added `src/assistant/prompt/sections/examples.test.ts` (3 tests: parser emits pairs, gating works for off, gating works when mes_example is null). All 209 tests under `src/assistant/` pass.
- [x] Documentation updated — JSDoc on `BuildPromptOpts.includeExamples` documents the precedence (request > opts > default-true).
