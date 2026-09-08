<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: selectAvatar throws on actors with no avatars; no safe-fallback API

**Status:** ✅ Done
**Priority:** P2
**Epic:** epic-character-core-system
**Labels:** avatar, fallback, error-handling
**Related:** TASK-character-multi-avatar.md, src/characters/services/avatar-service/selection.ts, src/routes/character-avatars/select.ts

## Summary

`AvatarService.selectAvatar()` throws `Error("No avatars found for actor …")`
when an actor has zero `character_avatars` rows. The route
`POST /api/actors/:actorId/avatars/select` translates that into a 404, which
the frontend cannot distinguish from "not found" — and there is no graceful
path to fall back to `actors.avatar_asset_id` (the base avatar) when no
emotion avatar matches the context.

## Context

- `src/characters/services/avatar-service/selection.ts:24-27` throws when
  `avatars.length === 0`.
- `src/routes/character-avatars/select.ts:48-49` —

  ```ts
  if (!avatar) { return jsonError({ message: "No avatar found", status: HttpStatus.NotFound, },); }
  ```

  Returns 404.
- Frontend `src/frontend/alpine/mood/avatars.ts:133-145` `avatarForMessage`
  already implements the per-message fallback chain (exact → neutral →
  first → `currentCharacter?.avatar_asset_id` base), but only when
  `_emotionAvatars` is non-empty. When `_emotionAvatars` is empty, it returns
  `null`, and `message-list.html:117` only renders the avatar slot if
  `avatarForMessage(msg) !== null`.
- `actors.avatar_asset_id` exists (`db/schema-character.ts`) — characters
  without any `character_avatars` row still have a base avatar asset id, but
  the API path to retrieve it isn't reachable via `selectAvatar`.

## Impact

- A character imported without the emotion-avatar batch generation step has
  no `character_avatars` rows. Chat still renders the bubble but skips the
  avatar (or, worse, fetches a stale `_currentEmotionAvatar`).
- The frontend mood panel (`mood-panel.html:101-106`) calls
  `generateEmotionAvatars()` which requires a `baseAvatarId` from
  `currentCharacter?.avatar_asset_id` — but if the user wants to *use* the
  avatar (select-by-context), they hit the 404 wall.
- The safe-fallback contract is split: FE knows about `avatar_asset_id`, BE
  doesn't surface it on the same endpoint.

## Fix

Two coordinated changes:

**Backend** — extend `selectAvatar` to consult `actors.avatar_asset_id` as
a terminal fallback:

1. After running weighted scoring + `fallbackChain`, if `bestScore <= 0` or
   no avatar matched, fetch `actors.avatar_asset_id` for the `actorId`.
2. Return a discriminated result:

   ```ts
   type AvatarSelectionResult =
     | { kind: "avatar"; avatar: Avatar }
     | { kind: "base"; avatarAssetId: string };
   ```

3. Update the route to surface both shapes (200 with `kind: "base"` rather
   than 404).

**Frontend** — adjust `selectEmotionAvatar` and `avatarForMessage` to handle
the `kind: "base"` shape from the API.

## Acceptance Criteria

- [x] `selectAvatar` returns `kind: "base"` + `avatarAssetId` when no
      `character_avatars` row matches.
- [x] Route `POST /api/actors/:actorId/avatars/select` returns 200 + base
      payload (not 404) for the empty-avatar case.
- [x] Frontend `mood/avatars.ts` handles the new payload without breaking
      existing `avatarForMessage` tests.
- [x] New unit tests cover: no avatars at all, no matching tag, fallback
      chain exhausted → base, base + world override.
- [x] `bun run check` green.

## Notes

**Reconciliation (2026-09-02)**: Prerequisite for epic Wardrobe selection ladder (TASK-selection-algorithm-v2-outfit-emotion.md) — fix first; ladder tests pin these branches. Matrix: matrix-emotion-avatar-assets.md → Ticket Reconciliation.

## Resolution

Verified against src/ in ticket-closeout-audit: selection.ts:resolveBaseAvatar synthesizes base portrait; avatar-service.test.ts:156 pins fallback.
