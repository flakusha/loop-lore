<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: AUX LLM emotion classifier (replace keyword EmotionHook)

**Status:** ⬜ Not Started
**Priority:** P3
**Epic:** epic-aux-enrichment-pipeline / epic-emotion-avatar-message-binding
**Labels:** aux-llm, emotion, classifier, hybrid
**Related:** TASK-aux-emotion-avatar.md, TASK-aux-mood-classification.md, src/generation/hooks/emotion-hook.ts, src/aux-pipeline/runner.ts

## Summary

Wire an AUX LLM classifier that emits a structured `EmotionClassification`
(`emotion`, `intensity`, `confidence`, `changeFromPrevious`) alongside the
keyword `EmotionHook` fast path. The keyword hook stays for offline / no-LLM
deployments; the AUX classifier runs in parallel and wins on higher
confidence. Aligns with the system prompt already drafted in
`TASK-aux-emotion-avatar.md:62-96`.

## Context

- `src/generation/hooks/emotion-hook.ts:53-78` — keyword table covers
  `happy / angry / sad / fearful / surprised / disgusted / loving / excited`.
  No intensity, no confidence, no contextual detection (a "she crosses her
  arms and looks away" passes through as `neutral`).
- The hook docstring (`emotion-hook.ts:4-9`) claims "Uses the LLM" — stale;
  the implementation is regex-only.
- `src/aux-pipeline/runner.ts` — shared policy: temperature 0, max tokens
  100, timeout 2s, BYO parity, telemetry via `aux.call`. Tasks registered:
  `transition | intent | memory | nsfw | gm-tool`.
- AUX runner does NOT currently include an `emotion` task type. Adding it
  requires updating `AuxTaskName` union + adding a prompt +
  registering the task.
- `TASK-aux-mood-classification.md:90-96` lists the same shape for mood
  classification — share infra / learnings.
- `TASK-emotion-avatar-message-binding.md:40-50` already pulls
  `dominantEmotion` from the keyword hook and persists to `messages.emotion`.
  The AUX classifier just needs to emit the same shape (`emotion_change`
  event with `data.dominantEmotion`).

## Scope

1. Add `EMOTION_CLASSIFIER_PROMPT` to `src/aux-pipeline/prompts.ts` per the
   system prompt in `TASK-aux-emotion-avatar.md:62-96`.
2. Extend `AuxTaskName` to include `"emotion"`.
3. Add `src/aux-pipeline/tasks/emotion.ts` — small wrapper that calls
   `callAux("emotion", …)` and parses the JSON response, returning a
   `HookResult` of `{ handled: true, eventType: "emotion_change", data: {
   dominantEmotion, intensity, confidence, changeFromPrevious } }`.
4. Register the task in `src/aux-pipeline/index.ts` (or alongside the
   EmotionHook registration in `src/generation/hooks/registry.ts`).
5. Hybrid mode in `emotion-hook.ts`: when the keyword hook returns no
   match (`handled: false`), the chain re-runs with the AUX classifier
   added. The AUX result replaces the keyword result when `confidence >= 0.5`.

## Acceptance Criteria

- [ ] `EMOTION_CLASSIFIER_PROMPT` defined, returns valid JSON shape.
- [ ] `aux-pipeline/tasks/emotion.ts` runs `callAux("emotion", …)` and
      surfaces the structured `EmotionClassification`.
- [ ] `EmotionHook` runs first (keyword); when no emotion matched, AUX
      runs; AUX result wins on confidence >= 0.5; otherwise null.
- [ ] `messages.emotion` persists AUX-detected emotion via the existing
      hook → store path (no new wiring required).
- [ ] Unit tests cover: prompt parsing, hybrid gating, telemetry event.
- [ ] `bun run check` + `bun test src/aux-pipeline/` green.