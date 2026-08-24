<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Task-clarification injection template for chat/assistant generation

**Status:** ✅ Done (2026-08-24, feat-injection-templates)
**Priority:** high
**Effort:** Medium
**Epic:** epic-context-injection-templates

## Summary

Add a system-role `[Task]` block to every prompt built by `PromptAssembler`, telling the LLM which task it is currently performing (chat-reply, auto-reply, vn-choice, vn-story, gm-decision). Generalizes the per-route hardcoded role switching into a single section consumed by all generate paths, so a single model handling many task types stays disambiguated.

The wording per task type lives in `src/prompts/task-clarification.ts`; the section lives at `src/assistant/prompt/sections/task-clarification.ts` and is registered in `PROMPT_SECTIONS` at index 1 (right after `system`, priority 0 — never trimmed under token budget). Callers pass `task: "..."` through `PromptParams.task`; `PromptAssembler` forwards it via `AssembleContext.task`.

## Scope (delivered 2026-08-24)

- `src/prompts/task-clarification.ts` — `GenerationTask` union (9 tasks), `TaskClarificationInput`, `buildTaskClarification()`.
- `src/assistant/prompt/sections/task-clarification.ts` — `taskClarificationSection` (`SectionBuilder`).
- `PromptParams` + `AssembleContext` gained `task?: string` and `action?: string` (optional, opt-out via `null`).
- 6 caller sites pass `task: "..."` (none set `action` in this iteration — plumbing only; see Follow-up).
- Tests: 7/7 pass (4 in `src/prompts/task-clarification.test.ts`, 3 in `src/assistant/prompt/sections/task-clarification.test.ts`).

## Out of scope (deferred)

- **Image-gen prompt path** — the original ticket mentioned generalizing `src/generation/prompt-templates/messages.ts:71`, but that file/path no longer exists in the current tree; image-gen is wired separately and is not a `PromptAssembler` caller. The `image-prompt` task is declared in the `GenerationTask` union/label map but no caller passes it yet. Deferred to a follow-up ticket once the image-gen prompt path is surveyed.
- **`action` field wiring** — `PromptParams.action` is plumbed through `AssembleContext.action` and used by the section when set, but no caller currently sets it. Deferred to follow-up.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
