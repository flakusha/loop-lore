<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Assistant and group-chat correctness defects

**Status:** In Progress
**Status Note:** [2026-10-26 final pass] 10 of 11 sub-defects fixed in place; 1 narrowed. FIXED: /help menu now wins over the bare `help` keyword (longest-key ordering, src/assistant/service.ts:59,73) — the map-order scan routed `/help` to the generic copy; empty/whitespace intent patterns are skipped instead of matching every message (src/assistant/intent.ts:29-34); `{value}`/`{prompt}` substitution is literal and global (`substituteToken`, src/assistant/workflow-runner.ts:29,123,159) so `$&` is no longer interpolated and a repeated placeholder is replaced; `checkPaused` null-guards the parsed value (`"null"`/scalar story_state returns false instead of throwing, src/group-chat/turn-selector.ts:242); command parsing splits on any whitespace (src/assistant/command-parser.ts:43); compaction uses the assembler's budget (src/generation/auto-gen/prepare-generation.ts:114); `dispatchCommand` labels the failing lookup leg and degrades a failed system-message insert to a warn (src/routes/messages/command.ts:203,276,352-364); GM execution enforces the actorId==userId invariant by rejecting non-user actors before BYO key resolution (src/assistant/gm-tool-execution.ts:130-142) and derives argv from a declared per-tool `paramOrder` instead of JSON key order (src/assistant/gm-tool-execution.ts:33-52,83-97); the world-lore timestamp write is awaited (src/assistant/prompt/sections/lore.ts:143-153); the mention regex carries a word-boundary lookbehind so `bob@example.com` is no longer a mention of `example`, and the composer validator reuses the server parser instead of a second drifted copy (src/group-chat/mention-parser.ts:35,206; src/frontend/alpine/composer-pre-send/validate.ts:39-44). Tests: src/assistant/{service,intent,workflow-runner,command-parser,gm-tool-execution}.test.ts, src/group-chat/{mention-parser,group-chat-coverage}.test.ts, src/frontend/alpine/composer-pre-send.test.ts (all green). REMAINING (narrowed, not silently dropped): an unresolved `@name` still does not block send — `PreSendValidation.ok` stays draft-non-empty and no template calls `validateDraft`, so wiring the warning into the composer UI is a frontend-template change outside this ticket's file set. `tsc --noEmit` clean.

**Status Note:** [2026-10-26 sweep-A verify] NOT-FIXED (issue 5e09182): 1 of 11 sub-defects fixed: /help matching rebuilt from RESPONSE_MAP keys with (?:^|\W) prefix (src/assistant/service.ts:69). Verified still broken: intent.ts:28 empty-pattern includes() always true; workflow-runner.ts:107,143 String.replace with string replacement ($-interpolation, single-shot); turn-selector.ts:239 result.value null crash; command-parser.ts:41 space-only separator; prepare-generation.ts:111 hardcoded 32_000 vs prompt.tokenBudget; routes/messages/command.ts narrow try (:297-302,:341) + allSettled mislabeled failure (:241-256); gm-tool-execution.ts:100,144 actorId-as-userId and :61-64 paramsToArgs flattening; prompt/sections/lore.ts:145 floating promise; mention-parser.ts:56 boundary-less @regex.
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

**Resolved:** 2026-10-26 registry-driven close: git issue 5e09182 (registry tip: 06040dd50 Konstantin Fedotov Close issue)
