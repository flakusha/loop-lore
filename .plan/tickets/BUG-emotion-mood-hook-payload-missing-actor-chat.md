<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: EmotionHook + MoodHook payloads don't carry actorId/chatId; ambiguous in group chats

**Status:** ⬜ Not Started
**Priority:** P3
**Effort:** Small
**Epic:** epic-character-core-system
**Related:** TASK-aux-emotion-avatar.md, TASK-aux-mood-classification.md, TASK-emotion-avatar-message-binding.md, src/generation/hooks/emotion-hook.ts, src/generation/hooks/mood-hook.ts, src/generation/hooks/types.ts

## Summary

`EmotionHook.execute()` and `MoodHook.execute()` accept a `HookContext` (which
carries `actorId` + `chatId`) but emit a `HookResult.data` payload with only
the detected signal — `{ dominantEmotion, indicators }` for emotion,
`{ dominantMood, delta, indicators }` for mood. In group chats where multiple
actors share one hook chain, downstream consumers must rely on **ambient
context** (the calling code knows which actor it was iterating) to associate
the event with the right character.

## Context

The hook registry (`src/generation/hooks/registry.ts:33-64`) iterates a flat
list of hooks per `runHookChain` call. The `HookContext` (`types.ts:23-41`)
already carries `chatId` and `actorId` — but `EmotionHook` (`emotion-hook.ts:38-42`)
and `MoodHook` (`mood-hook.ts:39-43`) both ignore it. Their `_context`
parameter is underscore-prefixed to mark it unused.

Today the only consumers (`src/generation/auto-gen/content-hooks.ts:122-132`,
`src/generation/auto-gen/post-store.ts:85-91`, `src/generation/auto-gen/story-mode.ts:185-188`)
resolve the actor from the **calling frame's `opts.actorId`** rather than from
the event payload. This works because today the hook chain runs once per
generation, with the actor known up-front.

The risk surfaces when:

1. **Group chat** runs the hook chain once per group turn — the chain
   produces one `emotion_change` event but multiple actors contributed
   content; the event has no actor binding.
2. **Future per-actor hook chaining** (planned in epic-emotion-avatar-message-binding
   follow-ups to bind emotion per-message) would re-run the chain per actor —
   the payload is still actor-ambiguous, forcing every consumer to thread
   `actorId` alongside the event payload.
3. **Telemetry**: `aux-pipeline/runner.ts:91-106` records `task`/`userId`/`chatId`
   from call opts; hook events don't propagate this either, so post-hoc
   audit ("what emotion was detected for actor X in chat Y?") is impossible.

## Fix

1. Extend `HookResult.data` contract — add `actorId: string` and `chatId: string`
   fields. Or, stronger: introduce a discriminated `HookResult` per `eventType`
   so each hook type's payload shape is type-safe.
2. Update `EmotionHook.execute` + `MoodHook.execute` to merge `_context.actorId`
   and `_context.chatId` into `data`.
3. Update `content-hooks.ts` consumers to read from payload instead of `opts.actorId`.
4. Update `hooks.test.ts:99-101, 142-144, 268-272` and `e2e-integration.test.ts`
   assertions to expect `actorId`/`chatId` in `data`.
5. Optional: add `actorId`/`chatId` to all 4 hooks (NSFW, Moderation too) for
   uniformity — currently they only need it for mood/emotion, but the same
   group-chat risk applies.

## Acceptance Criteria

- [ ] `EmotionHook.data` and `MoodHook.data` include `actorId` + `chatId` copied from `context`.
- [ ] Consumers (`content-hooks.ts`, `post-store.ts`, `story-mode.ts`) read actorId from payload, not opts.
- [ ] Existing hook tests green; new assertions for the new fields.
- [ ] Optional follow-up: NSFW + Moderation hooks carry the same fields for consistency.
- [ ] `bun run check` green.

## Notes

**Reconciliation (2026-09-02)**: Prerequisite for epic Emotion Avatar Message Binding persist path (regeneration/render work blocked until hook payload carries actor+chat).
