<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Emotion-Avatar Message Binding

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** backend persist + read + per-message frontend binding shipped (cbf8ec95); group-chat per-actor resolution and the end-to-end integration test pending
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
- Value set should align with `EmotionType` in `src/db/enums-character/avatar.ts`.

## Tasks

- [x] Migration: add `messages.emotion` column (in place) + regen schema
- [x] Backend: persist `dominantEmotion` to `messages.emotion` on assistant
      message create (`content-hooks.ts` extracts the `emotion_change` payload;
      `store-message.ts` and `story-store.ts` write it on both generation paths)
- [x] Backend: expose `emotion` in the messages read API (message reads select
      all columns; emotion rides along)
- [x] Frontend: message loop resolves per-message avatar from `message.emotion`
      + actor's emotion-tagged avatars; fallback to base avatar
      (`avatarForMessage` in `src/frontend/alpine/mood/avatars.ts`)
- [x] Frontend: per-message rendering no longer mutates the global
      `_currentEmotionAvatar` mood-driven swap (pure resolver; mood-avatar
      stays for non-message areas)
- [ ] Group chats: resolve the avatar per speaking actor instead of the chat's
      current character
- [x] Tests: migration/schema-sync, message-persist (hook→`messages.emotion`),
      and frontend `avatarForMessage` resolution unit-tested
- [ ] End-to-end integration test hook → `messages.emotion` →
      `avatarForMessage` (`TEST-emotion-hook-to-avatarForMessage-integration`)
- [x] Reconcile related epics/tickets (`TASK-aux-emotion-avatar` status note
      updated to the binding model; `TASK-emotions-avatar-edit-model` and
      `TASK-character-mood-happiness` done; `FEAT-avatar-expression-system`
      remains its own feature epic)

## Files

- `src/db/migrations/parts/006_messages_keys.ts` (migration) — done
- `src/db/schema-core.ts` / `src/db/schema-manifest.ts` (schema) — done
- `src/generation/hooks/emotion-hook.ts` (detect) — done
- `src/generation/auto-gen/content-hooks.ts` / `store-message.ts` (persist) — done
- `src/generation/auto-gen/story-store.ts` (story-mode persist) — done
- `src/characters/services/avatar-service/` (selection.ts selectAvatar)
- `src/chat/service/write.ts` / `read.ts` + `src/routes/messages/read.ts`
  (message create/read)
- `src/frontend/alpine/mood/avatars.ts` (`avatarForMessage`) +
  `mood-state.ts`
- `src/components/chat/message-list.html` (render) — done

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
- `TASK-emotions-avatar-edit-model.md` — variant generation (done)
- `FEAT-avatar-expression-system.md` — expression system
- `TASK-character-mood-happiness.md` — mood state (render context)
- `epic-messages.md` — message pipeline (parent for message-path changes)
- `epic-avatar-regeneration-control.md` — re-roll of emotion slots this epic binds
- `epic-asset-transform-metadata.md` — per-context framing of the bound avatar
- `epic-avatar-alpha-vn-layering.md` — alpha/sprite consumption of bound variants
- `epic-wardrobe-avatar-variants.md` — adds outfit axis to the bound emotion axis
