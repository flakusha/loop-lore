<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Context Injection Templates

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

| Ticket | Severity | Summary |
| ------ | -------- | ------- |
| [BUG-author-note-section-duplicates-post-history-instructions](../../tickets/BUG-author-note-section-duplicates-post-history-instructions-sam.md) | high | authorNote + postHistory both gated on `post_history_instructions`; same text injected twice as `<author_note>` + `<post_history>`; no real author-note field. |
| [BUG-example-dialogue-mes-example-few-shot-never-injected](../../tickets/BUG-example-dialogue-mes-example-few-shot-never-injected-include.md) | high | `examplesSection` needs `includeExamples` (default false); no caller sets it → character `mes_example` never injected. |
| [BUG-chatformats-template-config-defined-but-unused](../../tickets/BUG-chatformats-template-config-defined-but-unused-dead-standard.md) | medium | `LlmTemplateConfig.chatFormats` has 0 usages in `src`; message-format wrapping unimplemented. |
| [BUG-post-history-instruction-relocated-to-front](../../tickets/BUG-post-history-instruction-relocated-to-front-not-after-histor.md) | medium | `reorderPromptMessages` moves all system-role msgs to front; `<post_history>` lands at prompt top, not after history. |

## Open verification (not filed)

- `examplesSection` unrecognized label silently maps to `role:"user"` — validate instead.
- Confirm whether a distinct `author_note` DB column should be added (vs reusing post-history).
- Confirm `examples` placement (right before chatHistory, after system-front reorder) is the intended few-shot position.

## Status

Tickets filed. Implementation pending. No code changes made during review.
