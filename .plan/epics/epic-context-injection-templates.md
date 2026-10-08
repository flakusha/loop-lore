<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Context Injection Templates

**Status:** In Progress

**Status Note:** 3 of 4 filed bugs fixed in `src/`. 1 wontfix (chatFormats — no usages, dead config). 3 new gaps identified during review (output-style/nsfwPolicy PRIORITY, examples label validation, author_note column decision). See Findings table for per-ticket status.
**Priority:** medium
**Effort:** Medium
**Type:** epic
**Tags:** context-injection, templates, prompt-sections, examples, author-note
**Overview:** (see sections below)


## Goal

Inventory the template systems that feed the LLM prompt context window and
harden the "automated message extension" paths (examples, post-history,
author-note, chat formats). Ensure each template category is wired correctly
and not duplicated, disabled, or dead.

## Scope

- `src/assistant/prompt/sections/*` — 20 ordered section builders
- `src/assistant/prompt/registry.ts` — `PROMPT_SECTIONS` order
- `src/assistant/prompt/types.ts` — `PRIORITY` map
- `src/assistant/prompt-budget.ts` — `reorderPromptMessages`, `dropOverBudgetSections`
- `src/config/sections/templates.ts` — `LlmTemplateConfig` (systemPrompts, chatFormats)
- `src/prompts/registry.ts` — `LLM_PROMPT_DEFAULTS`, `resolveSystemPrompt`
- `src/chat/service/templates.ts` — chat setup templates (prepared context)

## Template inventory (categorized)

- **Assistant prompt sections** (context injection building blocks): system,
  nsfwPolicy, authorNote, actorHeader, pluginAgentRole, groupParticipants,
  userPersona, emotionAvatar, internalTraits, lore, memories, event,
  postHistory, storyContext, travel, gmNotes, dynamicContext, recentEvents,
  examples, chatHistory.
- **Standard templates** (built-in / config): `LLM_PROMPT_DEFAULTS` +
  `config.llm.systemPrompts[purpose]` (consumed); `ASSISTANT_SYSTEM_PROMPT`;
  `chatFormats` (dead — see ticket).
- **Prepared contextual templates**: chat setup templates (mode + features
  seeded from `chat-setup.yaml/toml`); character seed templates;
  story-context / dynamic-context sections.
- **Automated message extensions**: `examplesSection` (few-shot, disabled),
  `postHistorySection` (late instruction, misplaced), `authorNoteSection`
  (early instruction, duplicates post-history), `chatFormats` (unimplemented).

## Findings → Tickets

| Ticket | Severity | Status | Summary |
| ------ | -------- | ------ | ------- |
| `BUG-author-note-section-duplicates-post-history-instructions-sam.md` | high | **Done** | authorNote + postHistory both gated on `post_history_instructions`; same text injected twice as `<author_note>` + `<post_history>`; no real author-note field. |
| `BUG-example-dialogue-mes-example-few-shot-never-injected-include.md` | high | **Done** | `examplesSection` needs `includeExamples` (default false); no caller sets it → character `mes_example` never injected. |
| `BUG-chatformats-template-config-defined-but-unused-dead-standard.md` | medium | **Wontfix** | `LlmTemplateConfig.chatFormats` has 0 usages in `src`; message-format wrapping unimplemented. |
| `BUG-post-history-instruction-relocated-to-front-not-after-histor.md` | medium | **Done** | `reorderPromptMessages` moves all system-role msgs to front; `<post_history>` lands at prompt top, not after history. |
| `TASK-output-style-and-nsfwpolicy-sections-lack-priority-budget-en.md` | medium | **New** | `output-style` + `nsfwPolicy` sections lack PRIORITY entries → immune from budget dropping. |
| `TASK-validate-unrecognized-examples-section-role-labels-instead-o.md` | low | **New** | `examplesSection` unrecognized label silently maps to `role:"user"` — validate instead. |

## Open verification (not filed)

- Confirm `examples` placement (right before chatHistory, after system-front reorder) is the intended few-shot position.

## Status

Tickets filed. 3 of 4 bugs fixed in `src/`. 1 wontfix (chatFormats — dead config, no usages). 3 new gaps identified during review (output-style/nsfwPolicy PRIORITY entries, examples label validation, author_note column decision). Implementation ongoing.
