# TASK: Emotion-Avatar Message Binding (persist + render)

**Status:** 🟡 In Progress — migration + schema done
**Priority:** High
**Effort:** Medium
**Epic:** epic-emotion-avatar-message-binding
**Tags:** avatar, emotion, message, chat, rendering
**Related:** TASK-aux-emotion-avatar, TASK-emotions-avatar-edit-model, FEAT-avatar-expression-system

## Summary

Bind the character's emotion avatar to each **message's** detected emotion
(and to the **chat's** current character), replacing the global mood-derived
`_currentEmotionAvatar` used in `message-list.html`. Persist the dominant
emotion per assistant message, expose it in the messages API, and render the
matching emotion-tagged avatar variant per message.

## Why

- `message-list.html` renders one global `_currentEmotionAvatar` selected from
  `_mood.currentMood` — a single static expression per chat, not per message.
- `EmotionHook` already emits `emotion_change` with `data.dominantEmotion` but
  the value is never consumed (dead-end documented in `TASK-aux-emotion-avatar.md`).
- `AvatarService.selectAvatar(actorId, { emotion }, worldId)` exists and does
  weighted emotion-first selection over `character_avatars` emotion-tagged assets.

## Data Model (Done)

- `messages.emotion` (`text`, nullable) added in place to
  `src/db/migrations/parts/006_messages_keys.ts` and `Messages` interface
  (`src/db/schema-core.ts`); `schema-manifest.ts` regenerated (29 cols).
- Verified: `bun test src/db/schema-sync.test.ts` passes; manifest contains
  `emotion: col("text")`.

## Remaining Work

### 1. Backend — persist `dominantEmotion` on assistant message create
- Location: the assistant generation → message-store path (auto-gen /
  story / chat service). Consume `EmotionHook`/`emotion_change` output
  (`data.dominantEmotion`) and write it to `messages.emotion` for the
  assistant message being stored.
- Gate: `confidence >= 0.5` + change-from-previous (per `TASK-aux-emotion-avatar`).
- Fold `detectAvatarChangeIntent()` regex as a fast path (or remove) if it
  becomes redundant.
- Files: `src/generation/hooks/emotion-hook.ts`,
  `src/generation/auto-gen.ts`, `src/chat/service.ts`, `src/story/*`.

### 2. Backend — expose `emotion` in message read API
- Add `emotion` to the message DTO/select in the messages read path so the
  frontend receives it per message.
- Files: `src/routes/chats.ts`, `src/chat/service.ts`.

### 3. Frontend — per-message avatar resolution
- In the message loop, when rendering an assistant message with
  `msg.emotion`, resolve the matching avatar variant from the actor's
  emotion-tagged avatars; fall back to base `avatar_asset_id`.
- Replace the global `_currentEmotionAvatar` mood-derived swap in
  `message-list.html` for per-message rendering.
- Files: `src/frontend/alpine/chat-messages.ts`,
  `src/frontend/alpine/chat.ts`, `src/frontend/alpine/mood.ts`,
  `src/components/chat/message-list.html`.

### 4. Tests
- Message create persists `emotion`; message read returns `emotion`.
- `message-list.html` resolves per-message avatar (happy vs sad message →
  different variant); fallback to base when null.
- Keep schema-sync + existing avatar/mood tests green.

## Acceptance Criteria

- [ ] `messages.emotion` persisted on assistant message create
- [ ] Messages read API returns `emotion`
- [ ] Each assistant message renders its emotion-matching avatar variant
- [ ] Null/empty emotion falls back to the character base avatar
- [ ] Group chats resolve per-actor avatars
- [ ] Mood panel + emotion chips still work
- [ ] Full browser suite + schema-sync green

## Notes

- Touches user in-progress files (`src/chat/service.ts`, `src/routes/chats.ts`,
  `src/characters/services/avatar-service.ts`, `src/generation/auto-gen.ts`).
  Coordinate before editing those.
- Reconcile this epic across related tickets (see epic "Reconcile" task).
- **Known gap**: the story/game-master message-insert path
  (`src/generation/auto-gen.ts` ~L887) writes `emotion: null` because the
  EmotionHook does not run in that flow. Per-message avatar swap works for the
  auto-gen path (EmotionHook runs); GM-path messages fall back to the base
  avatar. Follow-up: thread the GM pipeline's emotion trace into that insert.
