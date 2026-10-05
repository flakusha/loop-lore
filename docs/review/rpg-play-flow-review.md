<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# RPG Play Flow Review

**Date:** 2026-10-05
**Scope:** Character creation → approval → impersonation → RPG chat/group chat play
**Worktree:** `feat-rpg-character-flow`

## Intended Flow

1. User creates own character
2. Character gets approved
3. User impersonates character (or existing character open for impersonation in world/detached chat)
4. Play in RPG chat / group chat

## Current State

### 1. Character Creation — ✅ Implemented

| Layer | Status | Evidence |
|-------|--------|----------|
| DB | ✅ `actors` table with `visibility`, `license_override` | `src/db/migrations/001_init.ts` |
| API | ✅ `POST /api/actors` | `src/routes/character-io/` |
| Service | ✅ `createActor()` | `src/characters/service/` |
| Frontend | ✅ Character creation form | `src/views/characters.html`, `src/frontend/alpine/characters.ts` |

### 2. Character Approval — ❌ Not Implemented

| Layer | Status | Evidence |
|-------|--------|----------|
| DB | ❌ No `review_state` column on `actors` | `src/db/migrations/001_init.ts` — no such column |
| API | ❌ No approval endpoints | `src/routes/` — no approval routes |
| Service | ❌ No approval service | `src/characters/service/` — no approval logic |
| Spec | ⚠️ `ReviewState` enum exists in spec only | `src/characters/spec/enums.ts:26-32` — `Draft/PendingReview/Approved/Rejected/Archived` |
| Spec | ⚠️ `CharacterRecord.review_state` field | `src/characters/spec/character-record.ts:26` — type-only, no DB backing |
| Spec | ⚠️ `ReviewRecord` type in serde | `src/characters/serde.ts:52-59` — type-only |

**Finding:** The approval workflow is entirely design-only. The `ReviewState` enum and related types exist in the spec layer but have no DB column, no route, no service, and no frontend. Characters are created directly with no review step.

### 3. Impersonation — ⚠️ Partially Implemented

| Layer | Status | Evidence |
|-------|--------|----------|
| DB | ✅ `impersonate_actor_id` column on `chat_participants` | `src/db/schema-core.ts:163` |
| API | ✅ `PUT /api/chats/:id/impersonate` | `src/routes/chats.ts:634` |
| Service | ✅ `updateImpersonation()` with 1-per-world constraint | `src/chat/service/participants.ts:28-72` |
| Prompt | ✅ `<user_persona>` section reads impersonated actor | `src/assistant/prompt/sections/user-persona.ts` |
| Frontend | ✅ Toggle in chat settings + input area | `src/frontend/alpine/chat-settings.ts:186`, `src/components/chat/input-area.html:49-53` |
| Commands | ✅ `/impersonate` + `/char` fully wired | `src/frontend/alpine/chat-actions/dispatch.ts:122-187` — `impersonate-toggle` + `impersonate-select` both handled; name→actor resolution via participants list |

#### 3a. Impersonation Constraint — Current: 1-per-world

The current constraint in `updateImpersonation()` (`src/chat/service/participants.ts:42-57`) checks if another user already impersonates the same actor in any chat belonging to the same world. This is **too coarse**:

- A character present in a world at a specific location should only be impersonated by one user **at that location**
- Different timelines or isolated chats should allow the same character to be impersonated by different users
- The current world-level check blocks legitimate parallel play

**Required refinement:** The constraint should be scoped to `(world_id, location_id)` or `(world_id, timeline_id)` rather than just `world_id`. Private/disconnected chats (no `world_id`) remain exempt.

#### 3b. "Open for Impersonation" Flag — ❌ Not Implemented

No `is_impersonatable` or `open_for_impersonation` flag exists on the `actors` table. Any character that is a chat participant can be impersonated, subject only to the 1-per-world constraint. There is no way for a character owner to mark their character as available for impersonation by others.

### 4. RPG Chat / Group Chat Play — ⚠️ Partially Implemented

| Layer | Status | Evidence |
|-------|--------|----------|
| Chat variants | ✅ `rpg` and `rpg_group` variants defined | `src/chat/types/variants.ts` |
| Variant resolution | ⚠️ `purpose` validated but never persisted | `src/chat/service/crud/create.ts:50-57` — `resolveVariantOverrides` computes purpose but `createChat` doesn't store it |
| DB | ❌ No `purpose` column on `chats` | `src/db/migrations/001_init.ts` — `chats` table has no `purpose` column |
| Frontend | ❌ No variant picker in new-chat form | `src/views/new-chat.html` — no variant field; `variantPicker` exists as standalone Alpine slice but not wired |
| World chat channels | ⚠️ Epic marked Done but channels not location-scoped | `.plan/epics/epic-world-chat-channels-invites.md` — "Done" but `chats` table has no `channel` or `location_id` column |
| RPG mechanics gating | ✅ `checkRpgEnabled()` per world | `src/rpg/service/world-gate.ts` |
| RPG routes | ✅ Combat, loot, quests, etc. | `src/routes/rpg/` |

#### 4a. Impersonated Actor Double-Play Bug

When a user impersonates a character in a group chat:
1. The character is added as a chat participant (AI participant)
2. The user's participant row gets `impersonate_actor_id` set to that character
3. Turn selection excludes only `actor_type === "user"` participants
4. The impersonated character (actor_type `character` or `ai`) is still selected for AI generation

**Result:** Both the user plays as the character AND the LLM generates responses for the same character. The impersonated actor should be excluded from AI turn generation.

#### 4b. Chat Purpose Not Persisted

The variant system validates a `(type, mode, purpose)` triple but `createChat` only persists `type` and `mode`. The `purpose` field (e.g., `rpg`, `combat`, `social`) is computed by `resolveVariantOverrides` but never stored. This means:
- RPG chats are indistinguishable from direct chats in the DB
- The `chat_purpose` column exists only on `dice_roll_history`, not on `chats`
- Variant selection is not reachable from the UI

## Gap Summary

| # | Gap | Severity | Component |
|---|-----|----------|-----------|
| 1 | Character approval workflow not implemented | High | characters |
| 2 | Impersonation constraint too coarse (world-level, should be location/timeline-level) | Medium | chat |
| 3 | No "open for impersonation" flag on actors | Medium | characters |
| 4 | Impersonated actor not excluded from AI turn generation | High | chat/generation |
| 5 | Chat purpose not persisted | Medium | chat |
| 6 | No variant picker in new-chat UI | Medium | frontend |

## Recommended Actions

1. **File ticket:** Character approval workflow (DB column + service + route + frontend)
2. **File ticket:** Refine impersonation constraint to location/timeline scope
3. **File ticket:** Exclude impersonated actors from AI turn generation
4. **File ticket:** Persist chat purpose on creation
5. **File ticket:** Wire variant picker into new-chat form
6. **Update epic:** `epic-impersonation.md` — add location-scoped constraint requirement
7. **Update epic:** `epic-world-chat-channels-invites.md` — clarify channel/location model
