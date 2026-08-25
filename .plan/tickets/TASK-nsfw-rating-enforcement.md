<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Nsfw Rating Enforcement

**Status**: done
**Priority**: medium
**Labels**: nsfw, rating, ui, enforcement
**Assignee**:
**Epic**: epic-nsfw-integration-gaps
**Related**: TASK-nsfw-rating-schema

## Summary

5-tier NSFW character rating UI + persistence. The runtime enforcement stack
was already wired (content-hooks reads `actors.content_rating`, the NsfwHook
computes `effective_limit = min(actor, user, chat)` via `isRatingAllowed`, the
user `max_rating` preference route + moderation service exist). The missing
piece — the character rating write surface + editor UI — lands here.

## Implementation

- `src/validation/schemas/primitives.ts` — `ContentRatingSchema` (5-tier union)
- `src/validation/schemas/actors.ts` — `contentRating` on create + update bodies
- `src/routes/characters/create.ts` — persists `content_rating` (defaults `sfw`)
- `src/routes/characters/update.ts` — `buildActorUpdates` maps `contentRating`
- `src/routes/views/character-edit-form.ts` — 5-tier `<select>` in the editor
- `src/routes/views/characters.ts` — passes the stored rating into the form
- `src/frontend/pages/characters-edit-form.ts` — submits `contentRating` on save

## Acceptance

- [x] Create actor with `contentRating` persists it; omitted defaults to `sfw`
- [x] Update actor can change `contentRating`
- [x] Invalid rating rejected (422)
- [x] Character editor renders a 5-tier rating selector with the current value
- [x] Create/update route tests + edit-form render test cover the contract

## Chat Audit 2026-08-25 — Cross-Reference

**Finding B4:** 5-tier `NSFWContentRating` (SFW→NSFW_EXTREME) exists in `src/schemas/nsfw-rating.ts` but is not referenced by `src/chat/types/nsfw.ts` or `moderation.ts`; intensity tier is not linked to moderation enforcement in the chat layer.

_Source: chat functionality audit (loop-lore), 2026-08-25. Related umbrella ticket for asset-injection feature: TASK-show-assets-scenes-worlds-items-to-character-via-chat-contex (issue afe0589)._
