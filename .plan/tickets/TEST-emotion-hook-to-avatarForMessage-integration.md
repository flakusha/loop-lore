<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TEST: End-to-end emotion-hook → messages.emotion → avatarForMessage

**Status:** ⬜ Not Started
**Priority:** P2
**Epic:** epic-emotion-avatar-message-binding
**Labels:** test, integration, emotion-avatar, end-to-end
**Related:** src/generation/hooks/emotion-hook.ts, src/generation/auto-gen/content-hooks.ts, src/generation/auto-gen/store-message.ts, src/frontend/alpine/mood/avatars.ts, src/frontend/alpine/mood.test.ts, src/generation/auto-gen-emotion-avatar.test.ts

## Summary

The emotion-avatar pipeline has **two halves** tested in isolation but no
test that wires them: `auto-gen-emotion-avatar.test.ts` proves
`EmotionHook` → `content-hooks.ts` → `messages.emotion`; `mood.test.ts`
proves `avatarForMessage(msg)` resolves per-message against
`_emotionAvatars`. Neither test confirms the full chain
(emotion detected → persisted → FE resolver picks the matching avatar).

A regression in either half won't surface until someone exercises the
flow manually.

## Context

- `src/generation/auto-gen-emotion-avatar.test.ts:216-311` tests
  `bind EmotionHook dominant emotion to messages.emotion`. It mocks LLM
  response generation and proves the hook → store path, but does **not**
  set up `character_avatars` rows or call `avatarForMessage`.
- `src/frontend/alpine/mood.test.ts:25-73` tests `avatarForMessage`
  against a hand-crafted `_emotionAvatars` array. The `msg.emotion`
  input is hand-typed — no path from a real `messages.emotion` DB row.
- The full chain:
  1. `EmotionHook.execute(assistantContent)` returns
     `{ eventType: "emotion_change", data: { dominantEmotion } }`
     (`src/generation/hooks/emotion-hook.ts:38-42`)
  2. `runContentHooks` extracts `dominantEmotion`
     (`content-hooks.ts:122-124`)
  3. `storeMessage` writes `messages.emotion = dominantEmotion`
     (`store-message.ts:137`)
  4. `listMessages` reads it back via `selectAll()`
     (`src/chat/service/read.ts:73-87`)
  5. `avatarForMessage(msg)` resolves it against `_emotionAvatars`
     (`src/frontend/alpine/mood/avatars.ts:133-145`)
- Steps 1-4 are tested by `auto-gen-emotion-avatar.test.ts`. Step 5 is
  tested by `mood.test.ts`. The seam — passing the persisted
  `messages.emotion` from DB → FE resolver → a real avatar asset_id —
  has no coverage.

## Scope

Add an integration test (either extending `auto-gen-emotion-avatar.test.ts`
or a new file `src/generation/emotion-avatar-pipeline.test.ts`) that:

1. Sets up: `actors` row with `avatar_asset_id`, two `character_avatars`
   rows with `tags.emotion = "happy"` and `"sad"` (and asset link rows).
2. Triggers `triggerAutoGeneration` with an emotionally-charged assistant
   reply ("She was so happy and filled with joy and love today!").
3. Reads back the `messages` row via `listMessages` and asserts
   `emotion === "happy"`.
4. Builds an FE-shaped `msg` object from that row + a hand-crafted
   `_emotionAvatars` list from the DB.
5. Calls `avatarForMessage(msg)` and asserts the resolved assetId is the
   "happy" avatar's asset, not the base avatar.

The test exercises **both halves in one run** with real DB rows.

## Acceptance Criteria

- [ ] Test sets up actor + 2 emotion-tagged avatars + 1 base avatar.
- [ ] Test runs `triggerAutoGeneration` with a happy LLM reply.
- [ ] Test asserts `messages.emotion === "happy"` post-store.
- [ ] Test asserts `avatarForMessage(msg)` returns the happy avatar's
      assetId (not base, not sad, not null).
- [ ] Test passes green under default suite (no `--isolate`).
- [ ] `bun run check` green.

## Notes

**Reconciliation (2026-09-02)**: Bound to epic Emotion Avatar Message Binding acceptance list.
