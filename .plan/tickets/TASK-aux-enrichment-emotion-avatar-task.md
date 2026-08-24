<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Implement `emotion_avatar` enrichment task in AUX pipeline

**Status:** ⬜ Not Started
**Priority:** P3
**Epic:** epic-aux-enrichment-pipeline
**Labels:** aux-llm, emotion-avatar, enrichment-task
**Related:** epic-aux-enrichment-pipeline.md (lines 208-216, 262-279), TASK-aux-emotion-avatar.md, src/aux-pipeline/

## Summary

`epic-aux-enrichment-pipeline.md` declares `emotion_avatar` as an
`EnrichmentTask` with a prompt template (lines 208-216, 276-278), but the
file `src/aux-pipeline/tasks/emotion-avatar.ts` was never created. The
`AuxTaskName` union in `src/aux-pipeline/types.ts:13` excludes
`"emotion-avatar"`, the `ENRICHMENT_PROMPTS` table does not exist (only
flat exports in `prompts.ts`), and there is no wrapper around `callAux` for
this task. The keyword `EmotionHook` in `src/generation/hooks/emotion-hook.ts`
is the only emotion-detection surface today.

## Context

- `src/aux-pipeline/` directory contents (from `read src/aux-pipeline`):
  `index.ts (540B)`, `prompts.ts (3.4KB)`, `runner.ts (4.8KB)`,
  `types.ts (1.2KB)`. **No `tasks/` subdirectory.**
- `src/aux-pipeline/types.ts:13` — `AuxTaskName = "transition" | "intent"
  | "memory" | "nsfw" | "gm-tool"`. `emotion_avatar` not in the union.
- `src/aux-pipeline/prompts.ts:11-90` — flat exports
  `TRANSITION_CLASSIFIER_PROMPT`, `INTENT_CLASSIFIER_PROMPT`,
  `GM_TOOL_DETECTION_PROMPT`, `MEMORY_EXTRACTION_PROMPT`. The
  `ENRICHMENT_PROMPTS` table from the epic design is not implemented.
- Epic declares the prompt at `epic-aux-enrichment-pipeline.md:276-278`:

  ```
  emotion_avatar:
    `You are an emotion classifier for a character's expression. Analyze the response
  to determine the character's emotion.
  Reply with ONLY JSON: { "emotion": "happy|sad|angry|...|excited", "intensity":
  0.0-1.0, "confidence": 0.0-1.0, "changeFromPrevious": true/false }`,
  ```

- `TASK-aux-emotion-avatar.md:179-188` "Files to Create" lists
  `src/aux-pipeline/tasks/emotion-avatar.ts` — never written.
- Existing `callAux` (`runner.ts:48-143`) takes any `AuxTaskName` but the
  task union must include the new variant to route prompts to it.
- `TASK-aux-mood-classification.md:93-95` calls for the same shape
  (`src/aux-pipeline/tasks/mood.ts`) — share the wrapper pattern.

## Scope

1. Create `src/aux-pipeline/tasks/emotion.ts` (file path decided at impl
   time; epic uses `tasks/emotion-avatar.ts` but the runner's flat task
   naming uses shorter slugs — pick one and document).
2. Export `EMOTION_CLASSIFIER_PROMPT` from `prompts.ts`.
3. Extend `AuxTaskName` to include the new variant.
4. Wrapper: takes `(db, config, messages, opts)`, calls
   `callAux(task, config, db, messages, opts)`, parses JSON, returns either
   `{ emotion, intensity, confidence, changeFromPrevious }` or null on
   parse error / timeout / low confidence.
5. Register the task in `src/aux-pipeline/index.ts` alongside the other
   exports.
6. Wire to `content-hooks.ts` (or a new dedicated hook) so it runs in
   parallel with the keyword `EmotionHook`, emitting the same
   `emotion_change` event shape. Confidence-gated merge: AUX wins when
   `confidence >= 0.5`, else fall through to keyword result.

## Acceptance Criteria

- [ ] `EMOTION_CLASSIFIER_PROMPT` exported and matches the epic spec.
- [ ] `AuxTaskName` includes `"emotion"` (or `"emotion-avatar"` — pick
      and document).
- [ ] Wrapper returns `null` on parse failure / timeout / LLM error
      (graceful degradation — never blocks the chat path).
- [ ] Wrapper unit test with a stubbed `callAux` covering the JSON-shape
      parse path.
- [ ] `bun run check` + `bun test src/aux-pipeline/` green.

## Open question

- File naming: epic uses `tasks/emotion-avatar.ts`; runner uses
  `AuxTaskName = "emotion"`. Reconcile by writing the file as
  `src/aux-pipeline/tasks/emotion.ts` and registering the slug
  `"emotion"` in the union, then add a docstring that explains the
  semantic mapping. Defer to the implementer.