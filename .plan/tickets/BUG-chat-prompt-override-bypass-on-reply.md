<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Chat-level promptOverride is persisted but never consumed by assistant reply or auto-generation

**Status:** done
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-output-control-transforms, epic-chat-lifecycle-moderation
**Files:** src/routes/messages/reply.ts:55-141; src/routes/messages/command.ts:101-117; src/routes/chats/manage.ts:106; src/routes/chats/prompt-template.ts

## Issue

`updateChat` accepts `promptOverride` and persists it. The only consumer is `GET /api/.../prompt-template` (the modal's preview read surface). Neither the rule-based assistant path (`reply.ts`) nor `triggerAutoGeneration` reads `chat.prompt_override` when assembling the system prompt.

The user-visible "Save Override" button (chat-settings / chat-prompt-template save handler) writes data that has **no functional effect** on the assistant's next turn. The override is shown in the preview modal but ignored at generation time.

## Why it matters

UX / correctness. Frontend advertises a feature ("Override System Prompt for this Chat") that does nothing server-side. Users who set a per-chat override expecting next-generation to honor it will see the default prompt used.

## Evidence

- `src/routes/chats/manage.ts:106` — `promptOverride` accepted in update body.
- `src/routes/chats/prompt-template.ts` — only read surface (preview modal).
- `src/routes/messages/reply.ts:55-141` — reads `chat.{type, mode, turn_strategy, story_state}` but NOT `prompt_override` when calling `triggerAutoGeneration`.
- `src/generation/auto-gen/auto-generation.ts:62-214` — does not accept a `promptOverride` parameter.

## Concrete fix

1. Extend `AutoGenOpts` (`auto-generation.ts:27-52`) with `promptOverride?: string | null`.
2. In `prompt-assembler.ts` / `build-prompt.ts`, when `promptOverride` is non-null/non-empty, prepend it to the system prompt (or use as the full system prompt if `override` is a full override vs. a suffix).
3. In `routes/messages/reply.ts` and `routes/messages/command.ts`, fetch `chat.promptOverride` and pass it through `AutoGenOpts.promptOverride`.
4. Document the precedence: `promptOverride` > per-actor `userPersona` > chat `systemPromptFallback` > global default.
5. Add a regression test: chat with `promptOverride = "Always respond in haiku."` → next AI message is a haiku.

## Tests

- `bun test src/routes/messages/reply.test.ts` — chat with override → generated message obeys override.
- `bun test src/routes/messages/command.test.ts` — `/create` in a chat with override → uses override for system prompt.
- `bun test src/generation/auto-gen-cascade.test.ts` — cascade respects override.

## Related

- `epic-output-control-transforms.md`, `epic-chat-lifecycle-moderation.md`.
- Existing `chat-setup-templates` work (separate but related concept).
