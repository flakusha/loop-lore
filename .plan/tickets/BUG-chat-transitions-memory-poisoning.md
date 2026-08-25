<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `promoteMessagesToMemories` / `classifyTransitionMessage` lack ownership checks — attacker can poison victim actor's memory store

**Status:** Not Started
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation, epic-assistant-gm-flows
**Files:** src/chat/transitions.ts:38-46, 128-177

## Issue

`classifyTransitionMessage` accepts a `userId` parameter and runs `classifyTransition` with that id. `promoteMessagesToMemories` accepts `actorId` and `chatId` and inserts into `actor_memories` keyed by `actor_id`.

Neither function checks that the caller is actually a participant of `chatId`, nor that the promoted messages belong to the actor. A malicious caller with a valid session could call `promoteMessagesToMemories` for **any** chat → injecting attacker-controlled `content` into a victim's `actor_memories` table, contaminating retrieval for that victim's future sessions.

The route layer (`POST /messages/:id` flow → `handleSceneTransitions` in `routes/messages/handle-scene-transitions.ts`) sits in front, but `transitions.ts` is exported and may be invoked from other callers (assistant creative studio, scripts, future plugins) that don't enforce ownership.

## Why it matters

Security / data integrity. Memory poisoning is harder to detect than message injection because the rows live in `actor_memories`, not `messages`. Future LLM retrieval pulls the poisoned rows into the prompt, potentially influencing behavior on subsequent sessions.

## Evidence

- `src/chat/transitions.ts:38-46` — `classifyTransitionMessage(userId, ...)` no participant check.
- `src/chat/transitions.ts:128-177` — `promoteMessagesToMemories(actorId, chatId, ...)` no ownership check.

## Concrete fix

1. Add a `requireOwnership(db, actorId, chatId, callerUserId)` guard at the top of `promoteMessagesToMemories` and `classifyTransitionMessage`:

   ```typescript
   const participant = await db
     .selectFrom("chat_participants",)
     .select(["role",],)
     .where("chat_id", "=", chatId,)
     .where("actor_id", "=", actorId,)
     .executeTakeFirst();
   if (!participant) { throw new OwnershipError("actor is not a participant of this chat"); }
   // optionally also check userId vs chat.created_by for non-participant callers
   ```

2. Add an integration test that tries the cross-actor attack and asserts the call is rejected.
3. Audit other exported functions in `transitions.ts` for the same pattern.

## Tests

- `bun test src/chat/transitions.test.ts` — cross-actor promote → rejected with `OwnershipError`.
- Same actor, chat they're not in → rejected.
- Legitimate call: actor is participant → succeeds.
- Audit: enumerate every exported function and confirm ownership check coverage.

## Related

- `BUG-users-persona-handlers-horizontal-priv-esc.md` (related horizontal-priv-esc class).
- `epic-chat-lifecycle-moderation.md`, `epic-assistant-gm-flows.md`.

## Chat Audit 2026-08-25 — Cross-Reference

**Finding B1:** Transition classifier over-triggers on ordinary prose. `src/chat/transition-classifier.ts` matches `location_change` via `/(to|into|toward|inside|outside|through|across|over)s+(thes+)?[a-z]+/i`, firing on narration like "to the store"/"into the night" → false transitions that poison memory/transition state.

_Source: chat functionality audit (loop-lore), 2026-08-25. Related umbrella ticket for asset-injection feature: TASK-show-assets-scenes-worlds-items-to-character-via-chat-contex (issue afe0589)._
