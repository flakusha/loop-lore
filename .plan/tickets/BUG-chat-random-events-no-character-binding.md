<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: random-event templates substitute `{npc}` from a generic pool, never from the chat's actual participants

**Status:** Not Started
**Severity:** low
**Priority:** low
**Effort:** small
**Type:** BUG
**Epic:** epic-creative-studio
**Files:** src/chat/random-events.ts:147-218

## Issue

`resolveTemplate` substitutes `{npc}` from a hardcoded `NPC_OPTIONS = ['a traveler', 'a merchant', ...]` pool — generic labels that ignore which NPCs are participants in the chat. Result: ambient events never mention characters the user knows. Same shape for `{location}` (falls back to a fixed list) and `{weather}`/`{scent}` (no awareness of the chat's location).

Additionally, `generateRandomEvent` is purely local with no awareness of:
- Chat participants (which NPCs / characters are actually in the conversation).
- Current location (the chat's active location).
- Time of day / world time.

`RandomEventOpts` accepts no participant or location context.

## Why it matters

Immersion. Random events are ambient world-building flavor — they feel hollow if they never reference the cast or setting the user is engaging with. A group chat with Alice, Bob, and Charlie gets "A merchant walks by" instead of "Alice glances at Bob, then at the strange merchant".

## Evidence

- `src/chat/random-events.ts:147-218` — `resolveTemplate` substitutes from fixed lists.
- `src/chat/random-events.ts:1-50` — `RandomEventOpts` shape lacks participants / location fields.

## Concrete fix

1. Extend `RandomEventOpts` with:
   - `participants?: { id: string; displayName: string; role: 'user' | 'ai' }[]`
   - `currentLocation?: { id: string; name: string; description?: string }`
   - `worldTime?: { hour: number; period: 'dawn' | 'day' | 'dusk' | 'night' }`
2. In `resolveTemplate`:
   - `{npc}` → first pick from `participants` (AI roles only), fall back to `NPC_OPTIONS`.
   - `{location}` → use `currentLocation.name`, fall back to `LOCATION_OPTIONS`.
   - `{weather}` → derive from `worldTime.period` (e.g. dawn = misty, day = clear, dusk = breezy, night = cold).
3. Update the caller (`post-store.ts:runAmbientEvents` or wherever `generateRandomEvent` is invoked) to pass participants and location from the chat context.
4. Tests:
   - Chat with participants `[Alice, Bob]` and `{npc}` template → output contains "Alice" or "Bob", not "a merchant".
   - No participants, `{npc}` template → falls back to `NPC_OPTIONS` pool.
   - `currentLocation.name = "Goblin Caves"` → `{location}` substitutes "Goblin Caves".
   - `worldTime.period = "night"` → `{weather}` substitutes "cold" or similar.

## Tests

- `bun test src/chat/random-events.test.ts` — add 4 cases.

## Related

- `TASK-random-encounters-events.md` (broader scope; this is a focused fix).
- `epic-creative-studio.md` (ambient world-building slice).
