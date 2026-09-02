<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Emotion-Avatar Message Binding

**Status:** 🟡 In Progress (migration + schema done)
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** avatar, emotion, message, chat, rendering

## Summary

Bind a character's **emotion avatar** to the **message/chat emotional context** —
not to the character globally. Each assistant message records the dominant
emotion detected during generation; the message loop renders the matching
emotion-tagged avatar variant for that message. Falls back to the character's
base/neutral avatar when no emotion is present.

## Motivation

Emotion avatars were generated as per-character variants (`character_avatars`
table, emotion-tagged assets), but the render path bound them to a single
global `_currentEmotionAvatar` derived from the character's slow-moving mood
(`_mood.currentMood`). That loses per-message expressiveness: a character can
smile in one message and frown in the next, but the global binding shows one
static expression.

The emotion→avatar pipeline was also a **dead end**: `EmotionHook` emits
`emotion_change` with `dominantEmotion` but nothing consumes it; the only
selection path is a manual `POST /api/actors/:actorId/avatars/select`.
(This dead-end is already documented in `TASK-aux-emotion-avatar.md`.)

## Data Model

- **`messages.emotion`** (`text`, nullable) — the dominant emotion of an
  assistant message, recorded at message-create time.
  - Migration: added in place to `src/db/migrations/parts/006_messages_keys.ts`
    (messages table) and the `Messages` interface (`src/db/schema-core.ts`);
    `schema-manifest.ts` regenerated. ✅ done.
- Resolution at render: for each assistant message with an `emotion`, call
  `AvatarService.selectAvatar(actorId, { emotion }, worldId)` (or a frontend
  mapping over the actor's emotion-tagged avatars) to pick the variant.
  Fallback: character base avatar.

## Binding Scope

- **Bound to message**: each assistant message shows the avatar matching its
  own detected emotion.
- **Bound to chat**: the chat's current character (the NPC in the active chat)
  is the actor whose avatars are selected. Group chats fall back to per-actor
  current-character avatars.
- **Not global**: remove reliance on the single `_currentEmotionAvatar`
  mood-derived selection for per-message rendering.

## Emotion Detection Sources

- `EmotionHook` (`src/generation/hooks/emotion-hook.ts`) — `emotion_change`
  event, `data.dominantEmotion` (keyword-based today; optional AUX-LLM upgrade
  per `TASK-aux-emotion-avatar.md`).
- `detectAvatarChangeIntent()` (`src/assistant/intent.ts`) — regex fast-path
  (currently dead code, folded into generation or removed).
- Value set should align with `EmotionType` in `src/db/enums-character.ts`.

## Tasks

- [ ] Migration: add `messages.emotion` column (in place) + regen schema ✅
- [ ] Backend: persist `dominantEmotion` to `messages.emotion` on assistant
      message create (consume `EmotionHook` output in the generation/chat path)
- [ ] Backend: expose `emotion` in the messages read API
- [ ] Frontend: message loop resolves per-message avatar from `message.emotion`
      + actor's emotion-tagged avatars; fallback to base avatar
- [ ] Frontend: drop the global `_currentEmotionAvatar` mood-driven swap for
      per-message rendering (keep mood-avatar for non-message areas if needed)
- [ ] Tests: migration/schema-sync, message-persist, message-read, and
      frontend message-list avatar resolution
- [ ] Reconcile related epics/tickets (`TASK-aux-emotion-avatar`,
      `TASK-emotions-avatar-edit-model`, `TASK-emotion-avatar-edit-model`,
      `FEAT-avatar-expression-system`, `TASK-character-mood-happiness`) to the
      new message-bound model

## Files

- `src/db/migrations/parts/006_messages_keys.ts` (migration) — ✅
- `src/db/schema-core.ts` / `src/db/schema-manifest.ts` (schema) — ✅
- `src/generation/hooks/emotion-hook.ts` / `src/generation/auto-gen.ts` (persist)
- `src/characters/services/avatar-service.ts` (selectAvatar)
- `src/routes/chats.ts` / `src/chat/service.ts` (message read/create)
- `src/frontend/alpine/chat.ts` / `src/frontend/alpine/chat-messages.ts`
- `src/components/chat/message-list.html` (render)

## Acceptance Criteria

- [ ] Assistant messages carry an `emotion` value on read
- [ ] Each assistant message renders the emotion-matching avatar variant
- [ ] Messages without emotion fall back to the character base avatar
- [ ] Group chats select per-actor avatars correctly
- [ ] Existing mood panel + emotion chip features continue to work
- [ ] Full browser suite green; schema-sync test green
- [ ] Related epics/tickets reconciled

## Related Epics / Tickets

- `TASK-aux-emotion-avatar.md` — detects the dead-end; AUX-LLM classifier
- `TASK-emotions-avatar-edit-model.md` / `TASK-emotion-avatar-edit-model.md` —
  variant generation (done)
- `FEAT-avatar-expression-system.md` — expression system
- `TASK-character-mood-happiness.md` — mood state (render context)
- `epic-messages.md` — message pipeline (parent for message-path changes)
- `epic-avatar-regeneration-control.md` — re-roll of emotion slots this epic binds
- `epic-asset-transform-metadata.md` — per-context framing of the bound avatar
- `epic-avatar-alpha-vn-layering.md` — alpha/sprite consumption of bound variants
- `epic-wardrobe-avatar-variants.md` — adds outfit axis to the bound emotion axis
