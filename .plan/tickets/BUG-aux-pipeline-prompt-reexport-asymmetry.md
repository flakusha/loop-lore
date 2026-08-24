<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: aux-pipeline index.ts re-export set doesn't match AuxTaskName union

**Status:** ⬜ Not Started
**Priority:** P3
**Effort:** Trivial
**Epic:** epic-aux-enrichment-pipeline
**Related:** src/aux-pipeline/index.ts, src/aux-pipeline/prompts.ts, src/aux-pipeline/types.ts, src/prompts/registry.ts

## Summary

`src/aux-pipeline/index.ts:10-15` re-exports 3 of the 5 task prompts that match
the `AuxTaskName` union. `GM_TOOL_DETECTION_PROMPT` and `NSFW_POLICY_PROMPT` /
`NSFW_POLICY_LEVELS_PROMPT` are defined in `prompts.ts` (or in `src/prompts/registry.ts`)
but never re-exported from the AUX barrel, breaking the "centralized aux prompts
home" contract.

## Context

`AuxTaskName` (`src/aux-pipeline/types.ts:13`) is the typed set of tasks the
shared runner accepts:

```ts
export type AuxTaskName = "transition" | "intent" | "memory" | "nsfw" | "gm-tool";
```

`prompts.ts` defines:

- `TRANSITION_CLASSIFIER_PROMPT` (transition) ✅ re-exported
- `INTENT_CLASSIFIER_PROMPT` (intent) ✅ re-exported
- `MEMORY_EXTRACTION_PROMPT` (memory) ✅ re-exported
- `GM_TOOL_DETECTION_PROMPT` (gm-tool) ❌ NOT re-exported (defined locally)
- `NSFW_*` (nsfw) ❌ NOT re-exported (lives in `src/prompts/registry.ts`)

This means:

1. **Consumers import via `src/prompts/registry`** instead of `src/aux-pipeline`:
   - `src/assistant/gm-tool-detection.ts:113` → `resolveSystemPrompt(config.templates.llm, "gmTool",)`
   - `src/generation/hooks/nsfw-classifier.ts:61` → `resolveSystemPrompt(context.config.templates.llm, "nsfw",)`

   These bypass the aux-pipeline barrel entirely, undermining the AUX runner
   abstraction's claim to own its prompts.

2. **Inconsistent prompt location**: `GM_TOOL_DETECTION_PROMPT` lives in
   `src/aux-pipeline/prompts.ts:43-68` (home) but `NSFW_POLICY_PROMPT` lives
   in `src/prompts/registry.ts:40-54` (away). Either the home is wrong or the
   registry is.

3. **Code review hazard**: a future task implementing
   `TASK-aux-emotion-avatar.md` (add `EMOTION_CLASSIFIER_PROMPT`) will set the
   convention. Better to settle it now.

## Fix

Pick **one** convention and align the AUX index with the union:

**Option A (recommended — AUX owns its prompts)**:

1. Move `NSFW_POLICY_PROMPT` and `NSFW_POLICY_LEVELS_PROMPT` from
   `src/prompts/registry.ts` to `src/aux-pipeline/prompts.ts`.
2. Re-export all 5 from `aux-pipeline/index.ts`.
3. Update `src/prompts/registry.ts` to import these from `aux-pipeline`
   (single source of truth for the `LLM_PROMPT_DEFAULTS` mapping).
4. `gm-tool-detection.ts:113` and `nsfw-classifier.ts:61` resolve via
   `resolveSystemPrompt(config.templates.llm, "gmTool"|"nsfw",)` — this still
   works because the registry re-imports the now-canonical prompts from
   aux-pipeline.

**Option B (registry owns prompts, AUX is a runner-only concern)**:

1. Move `TRANSITION_CLASSIFIER_PROMPT`, `INTENT_CLASSIFIER_PROMPT`,
   `MEMORY_EXTRACTION_PROMPT`, `GM_TOOL_DETECTION_PROMPT` from
   `aux-pipeline/prompts.ts` to `src/prompts/registry.ts`.
2. `aux-pipeline/prompts.ts` becomes empty / deleted.
3. `aux-pipeline/index.ts` re-exports nothing prompt-related (or only a
   resolver helper).

## Acceptance Criteria

- [ ] All 5 `AuxTaskName` tasks have a single-source prompt location.
- [ ] `aux-pipeline/index.ts` re-export set matches the union (either all 5
      prompts re-exported, or 0 prompt re-exports if Option B).
- [ ] `src/prompts/registry.ts` no longer drifts from the AUX home.
- [ ] Existing tests (`nsfw-classifier.test.ts`, `gm-tool-detection.test.ts`,
      `registry.test.ts`) pass without modification.
- [ ] `bun run check` green.