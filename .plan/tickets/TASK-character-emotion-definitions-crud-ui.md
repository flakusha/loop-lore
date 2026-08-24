<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Character emotion definitions CRUD + admin UI

**Status:** ⬜ Not Started
**Priority:** P3
**Epic:** epic-character-core-system / epic-emotion-avatar-message-binding
**Labels:** emotion, admin, crud, definitions
**Related:** TASK-emotion-intent-detection.md, src/routes/character-emotions/definitions.ts

## Summary

`/api/emotions` exposes GET + POST but not PUT/DELETE. The `emotions` and
`character_emotions` tables exist, `EmotionDefinitionListResponse` is wired,
but there's no UI to edit a definition, no DELETE route, and no
`character_emotions` write path beyond the current per-actor CRUD. Make the
admin-side emotion registry editable end-to-end and align the LLM-emotion
labels with the canonical `EmotionType` enum.

## Context

- `src/routes/character-emotions/definitions.ts:30-110` — GET + POST only.
  No PUT (update name / valence / arousal / category), no DELETE.
- `src/routes/character-emotions/actor.ts:21-100` — actor-level emotion
  CRUD exists but there's no admin surface to manage the global registry.
- `TASK-emotion-intent-detection.md:191-198` lists Phase 1 (CRUD + admin
  UI) as the prerequisite for hybrid detection (Phase 2).
- LLM-detected emotions (`detectEmotion`/AUX) need to align with the
  canonical `EmotionType` enum (`src/db/enums-character/avatar.ts:37-57`).
  18 enum values; the LLM prompt in TASK-aux-emotion-avatar.md lists
  12. If LLM labels and avatar tags diverge, `calculateAvatarScore` returns
  0 and `_currentEmotionAvatar` falls back to neutral.
- `EMOTION_PROMPT_MODIFIERS` (`emotion-avatar-service/emotions.ts:10-29`)
  is hardcoded against the enum — adding a custom emotion requires adding
  a row to `emotions` AND a config override in `templates.avatar.emotions`
  to win.

## Scope

1. Add PUT + DELETE to `/api/emotions/:id` and
   `/api/characters/:actorId/emotions/:emotionId`.
2. Admin UI surface: list, create, edit, delete emotion definitions. Wire
   into existing admin layout (`src/views/admin/`).
3. Document the mapping between custom emotion names and `EmotionType`
   enum: LLM-emitted label must either be an enum value, or have a
   `EmotionType` alias row in `emotions` table.
4. Validation: reject definition updates that would orphan
   `character_emotions` rows (FK action).

## Acceptance Criteria

- [ ] `PUT /api/emotions/:id` updates name / category / valence / arousal.
- [ ] `DELETE /api/emotions/:id` rejects when `character_emotions` rows
      reference the emotion (or cascades with confirmation).
- [ ] Admin UI: list, create, edit, delete definitions.
- [ ] LLM-emotion → `EmotionType` alias documented; LLM labels not in the
      enum map to `neutral` (graceful degradation, not an error).
- [ ] Unit tests cover PUT/DELETE + admin authz.
- [ ] `bun run check` green.