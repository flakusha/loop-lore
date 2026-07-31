# TASK: Character Avatar Gallery Binding

**Status:** 🟡 In Progress
**Priority:** High
**Effort:** Medium
**Epic:** epic-frontend-gallery, epic-character-core-system

## Summary

Wire character avatars into the gallery asset system with entity binding and visibility inheritance. Currently, character avatars are stored in `character_avatars` with an `asset_id` reference, but no `asset_links` entry is created — making them invisible to the gallery's entity filtering. This task adds the missing link and wires the gallery to filter by character.

## Problem

```
Character avatar created
  → character_avatars row ✅ (asset_id stored)
  → assets row ✅ (file stored)
  → asset_links row ❌ (NOT created)
  → Gallery can't filter by character ❌
```

When a user uploads a character avatar, the asset appears in the global gallery but has no association back to the character. The gallery has no way to show "assets belonging to character X."

## Scope

### Backend

1. **Link avatar assets on creation** — `avatar-service.ts` `createAvatar()` must call `linkAsset()` with `entityType: "actor"` and the actor ID. Same for emotion avatar generation in `emotion-avatar-service.ts`.

2. **Gallery filter by entity** — Add `entity_type` and `entity_id` query params to the gallery grid/search endpoints (`/dynamic/gallery/grid`, `/dynamic/gallery/search`) so the gallery can show only assets linked to a specific character.

3. **Character detail gallery tab** — Add a "Gallery" tab to the character detail modal that shows assets linked to this character via `asset_links` where `entity_type = "actor"`.

### Frontend

1. **Character detail modal gallery tab** — New tab in `src/partials/characters/detail-modal.html` showing linked assets with thumbnails, labels, and unlink action.

2. **Gallery page character filter** — Optional: dropdown or tag filter on the gallery page to filter by linked entity type (character, chat, world, etc.).

### Visibility

1. **Visibility inheritance** — Character avatars should respect the character's publicity setting:
   - If character is public → avatar assets are public in gallery
   - If character is private → avatar assets are only visible to the owner
   - This is a gallery-layer filter, not an asset-level change (assets themselves stay as-is)

## Files to Modify

| File | Change |
|------|--------|
| `src/characters/services/avatar-service.ts` | Add `linkAsset()` call in `createAvatar()` |
| `src/characters/services/emotion-avatar-service.ts` | Add `linkAsset()` call after emotion avatar generation |
| `src/routes/views.ts` | Add entity filter params to `serveGalleryGrid` and `serveGallerySearch` |
| `src/partials/characters/detail-modal.html` | Add gallery tab |
| `src/frontend/pages/characters.ts` | Add gallery tab logic |
| `src/routes/character-avatars.ts` | Add unlink endpoint or integrate with existing delete |

## Acceptance Criteria

- [x] Creating a character avatar produces an `asset_links` entry (`entity_type: "actor"`)
- [x] Generating emotion avatars produces `asset_links` entries for each generated avatar
- [x] Gallery page can filter by `entity_type=actor&entity_id=<actorId>` to show only that character's assets
- [ ] Character detail modal has a "Gallery" tab showing linked assets with thumbnails
- [ ] Unlinking an asset from a character removes the `asset_links` entry (asset itself preserved)
- [ ] Character visibility is respected: private character's avatars not shown in public gallery
- [ ] Existing avatar creation flow (upload, import, emotion gen) all produce correct links
- [x] Tests pass for new linking behavior
- [x] Typecheck clean

## Reference

- `asset_links` schema: `src/db/schema-content.ts:30-38`
- `AssetLinkEntity` enum: `src/db/enums-content.ts:39-50` (includes `Actor: "actor"`)
- `linkAsset` function: `src/assets/service.ts`
- Import flow (correct pattern): `src/routes/import.ts:159` — already calls `linkAsset` with `AssetLinkEntity.Actor`
- Gallery grid: `src/routes/views.ts:623` — currently shows ALL assets, no entity filter
- Gallery search: `src/routes/views.ts:675` — currently searches ALL assets
