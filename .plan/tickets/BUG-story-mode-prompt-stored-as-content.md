<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: story-mode.ts stores `turnResult.prompt` as the message content — `gmDecision.turnPrompt` is the prompt to LLM, not the user-visible AI response

**Status:** Not Started
**Severity:** high
**Priority:** high
**Effort:** small
**Type:** BUG
**Epic:** epic-assistant-gm-flows
**Files:** src/generation/auto-gen/story-mode.ts:114-156; src/story/game-master/execute.ts

## Issue

`triggerStoryModeGeneration` calls `gm.executeTurn()` and then writes `turnResult.prompt` to the database as the message content (line 145-156):

```typescript
const result = await deps.encryptAtRest({
  database,
  chatId,
  plaintext: turnResult.prompt,  // <-- stored as the AI response
  ...
});
```

`turnResult.prompt` (per `GameMasterService.executeTurn` contract — verified in `src/story/game-master/execute.ts`) is the **prompt that was sent to the LLM**, not the AI's reply. The actual `response` field on the GM service is returned separately; in some code paths the response is `null` because story mode uses an external GM UI for input.

Net effect: in story mode, the **stored message content is the prompt text the user typed** (or the synthesized GM prompt), not the AI's response. Users see their own prompt as the AI's message in chat history.

## Why it matters

Correctness. Story-mode chats show inverted conversation: the AI "messages" contain the input prompt. Anyone reading the chat history sees the wrong content. This is show-stopping for the GM-guided story creation feature.

## Evidence

- `src/generation/auto-gen/story-mode.ts:114-156` — `turnResult.prompt` is the only thing stored.
- `src/story/game-master/execute.ts` (verified via scout output) — `executeTurn` returns `prompt=gmDecision.turnPrompt`, `response` may be null in interactive GM mode.

## Concrete fix

1. Audit `GameMasterService.executeTurn()` to confirm the return shape: what does `turnResult.response` actually contain for LLM-driven vs Human-driven GM modes?
2. For LLM mode: `turnResult.response` is the AI reply text — store that.
3. For Human mode: `turnResult.response` is `null` — fall back to the actor's user input (i.e. the user IS the GM; the prompt is their message and the response is empty until they reply).
4. Add a regression test: trigger story-mode in an LLM GM chat → stored message content equals the AI's actual response (not the prompt).
5. Add a regression test: trigger story-mode in a Human GM chat → no message is auto-stored (the GM is the user and posts via the chat input directly).

## Tests

- `bun test src/generation/auto-gen/story-mode.test.ts` — both modes.
- Snapshot test the stored `messages.content` field for each mode.

## Related

- `epic-assistant-gm-flows.md` — `TASK-wire-gm-service-story-mode.md` already shipped the wiring but missed this content-swap bug.
- `BUG-chat-prompt-override-bypass-on-reply` (same pipeline).
