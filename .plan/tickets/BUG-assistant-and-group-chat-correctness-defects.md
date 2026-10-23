<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Assistant and group-chat correctness defects

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-group-chat

**Summary:**

Ten verified defects in the assistant, group-chat and slash-command paths.

- src/assistant/service.ts:39 — the '/help' entry is matched with \b/help\b; the leading \b cannot match at the start of a string, so '/help' typed by a user never matches and they get the fallback greeting.
- src/assistant/intent.ts:28 — detectAvatarChangeIntent does lower.includes(pattern.pattern.toLowerCase()); an empty pattern string returns true for every message.
- src/assistant/workflow-runner.ts:107,143 — String.replace with a string replacement interpolates $&, $`, $' and  from the substituted value. Replace the literal with a replacer function. The same line is also single-shot, so a second {value} placeholder in the template is left literal.
- src/group-chat/turn-selector.ts:239 — checkPaused does result.value.isPaused without a null check; safeJsonParse('null') yields { ok: true, value: null }, so story_state of 'null' throws a TypeError.
- src/assistant/command-parser.ts:41 — command extraction uses indexOf(' ') (U+0020 only), so a tab-separated /roll\t2d6 parses the command as 'roll\t2d6' and never dispatches.
- src/generation/auto-gen/prepare-generation.ts:109 — compactPromptHistory is called with a hardcoded 32_000 rather than prompt.tokenBudget.
- src/routes/messages/command.ts:266-273 — only the handler call is inside try/catch; insertCommandSystemMessage at :162 and fetchChatAndRole at :214 are outside it, so a DB failure surfaces as an unhandled 500. At :226 a settled rejection throws 'dispatchCommand: chat context lookup failed' even when the failing leg was the messages query.
- src/assistant/gm-tool-execution.ts:95 — actorId is passed into detectGmTool's userId parameter, and :138 sets userId: actorId; the actorId === userId invariant is implicit and unenforced.
- src/assistant/gm-tool-execution.ts:61-65 — paramsToArgs flattens the params object to positional strings, discarding labels; a tool whose parameter order changes silently changes the command it invokes.
- src/assistant/prompt/sections/lore.ts:145 — the world-lore timestamp update is a floating promise; the actor-side write is not sequenced against it.
- src/group-chat/mention-parser.ts:56 — /@([A-Za-z0-9_-]+)/g has no boundary guard, so bob@example.com resolves as a mention of 'example'. src/frontend/alpine/composer-pre-send/validate.ts:59 returns unresolvedMentions without blocking, and mention-parser.ts:120-133 drops them server-side, so a typo'd @name silently sends a message with no mention.

Source: .tmp/longcat/review-groupchat-assistant.md GC-1, GC-2, GC-3, GC-4, GC-5, GC-6, GC-7, GC-8, GC-9, GC-11, GC-12, GC-14, GC-15, GC-16.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
