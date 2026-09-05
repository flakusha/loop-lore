// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

# BUG: random-event templates substitute `{npc}` from a generic pool, never from the chat's actual participants

**Status:** ✅ Done
**Priority:** low
**Severity:** low
**Effort:** small
**Type:** BUG
**Epic:** epic-creative-studio
**Files:** src/chat/random-events.ts, src/generation/auto-gen/post-store.ts

## Issue

`resolveTemplate` substituted `{npc}` from a hardcoded `NPC_OPTIONS` pool — generic labels that ignore which NPCs are participants in the chat. Same shape for `{location}` (fixed-list fallback) and `{weather}` (no awareness of the chat's location or world-time).

## Resolution

`RandomEventOpts` already accepted `participants`, `currentLocation`, and `worldTime` (the bug filed against the previous ticket BUG-chat-random-events-no-character-binding); the placeholder logic in `resolveTemplate` already preferred AI participants + the chat's location + period-derived weather. The actual defect was that **no caller passed those options**. Fixed in the random-events-wiring worktree:

1. `applyPostStoreEffects` now loads chat participants via
   `chat_participants JOIN actors` (mapping `actor_type === "character"`
   → role `"ai"`, others → `"user"`) and the chat's current location
   (`chats.current_location_id` → `locations` row) in parallel with the
   message count.
2. Both are passed to `generateRandomEvent`. Generated events now
   substitute real AI participant display names for `{npc}` and the chat's
   location name for `{location}` when present; `NPC_OPTIONS` and
   `LOCATION_OPTIONS` are now actual fallbacks rather than the only path.
3. Tests at `src/chat/random-events.test.ts` cover the four cases listed
   in the bug (AI participants, currentLocation, worldTime period,
   no-AI-participants fallback) — all pass.

Files: `src/chat/random-events.ts` (cleanup), `src/chat/random-events.test.ts` (updated tests), `src/generation/auto-gen/post-store.ts` (wiring + helpers `loadChatParticipants` / `loadChatLocation`).
