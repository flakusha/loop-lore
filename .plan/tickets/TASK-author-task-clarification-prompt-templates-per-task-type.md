<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Author task-clarification prompt templates per task type

**Status:** ✅ Done (2026-08-24, feat-injection-templates)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-context-injection-templates

## Summary

Authored `src/prompts/task-clarification.ts` with one `TASK_LABEL` entry per known `GenerationTask` value. Each entry is a short human-readable phrase (no policy, no extra instructions) describing what the LLM is currently doing. Consumed by `taskClarificationSection`, which assembles a single `[Task]` system block referencing the active task plus optional chat mode / character / assistant / action context.

## GenerationTask union (delivered 9 templates)

```
"chat-reply"     generate the next assistant reply in a roleplay chat
"auto-reply"     generate an automated assistant reply in a group chat
"continue"       continue a partially generated message
"vn-choice"      generate choice cards for a visual-novel scene
"vn-story"       generate the next visual-novel story beat
"gm-decision"    make a game-master decision that advances the story
"image-prompt"   write an image-generation prompt from the scene
"summarize"      summarize the conversation so far
"extract"        extract structured data from the conversation
```

Unknown task strings fall back to the raw task name (no throw).

## Note on original ticket wording

The original draft named 6 templates (`reply, continue, summarize, extract, emotion, vn-scene`). The delivered union is broader (`chat-reply` + `auto-reply` instead of generic `reply`; `vn-choice` + `vn-story` instead of generic `vn-scene`) and omits `emotion` (the FEAT scope uses `chat-reply` semantics — emotion is conveyed separately via the `emotion_avatar` section, not the task-clarification block). Names align with the actual caller sites in `prepare-generation.ts`, `build-prompt.ts`, `context-budget.ts`, `vn-generate/choices.ts`, `vn-generate/story.ts`, `story/gm/decisions/llm.ts`.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
