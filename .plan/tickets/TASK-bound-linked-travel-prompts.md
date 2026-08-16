<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Bound/Linked Travel Prompts (User + LLM Migration Suggestion)

**Status**: open
**Priority**: medium
**Labels**: chat, travel, locations, migration, llm, assistant
**Assignee**:
**Epic**: epic-chat-transfer-location
**Related**: FEAT-world-template-chat-lifecycle, FEAT-chat-template-config-lifecycle,
FEAT-chat-transfer-location-change, TASK-chat-transfer-location

## Description

Make travel between locations/chats **consistent and discoverable** at the narrative
level: users and LLMs get prompted to migrate when the story crosses a location boundary,
using the existing travel + migration endpoints rather than ad-hoc chat hopping.

Today the travel mechanics exist (`PUT /api/chats/:id/location`, transfer/join, chat
sections, `migrateChat`) but nothing **prompts** a move: no assistant/turn-level hint, no
UI suggestion, no LLM-aware travel trigger. The reconciliation audit (2026-08-15) found
zero travel/migration references in `src/assistant/`, `src/prompts/`, `src/turning/`.

## Design

### 1. User-facing travel prompt (UI)

- When a chat's current location changes (or a transition regex fires
  `ChatTransition.location_change`), show a suggestion card in `location-panel.html`:
  "Continue here (in-chat) / New chat at destination / Join existing chat" — reuse the
  three travel modes from `epic-chat-transfer-location.md` §Design.
- Destination location picker pre-fills from the detected transition target when resolvable.

### 2. LLM-facing migration prompt (bound/linked travel)

- New prompt section in `src/assistant/prompt/sections/` (e.g. `travel.ts`): tells the
  assistant it **may narrate travel** and, when it does, emit a structured travel intent
  (location target) that the regex pipeline turns into a `location_change` transition
  (extend `src/regex/` intent extraction if needed).
- Assistant instructions include: when bound/linked travel is on, suggest moving the chat
  to another location/chat when the narrative leaves the current one; never fabricate
  locations — reference only known world locations.
- Toggle: `assistantConfig.travelPrompts` (default off; enabled via template feature
  "linked travel" or chat settings). The `world` template (see
  FEAT-world-template-chat-lifecycle) may enable it.

### 3. Migration carries location context

- `migrateChat` (`src/chat/service/transitions.ts`) already re-points
  `current_location_id` from the source — extend optional `carry.location = true` to also
  copy chat sections + `chat_pins` location markers, so a migrated chat keeps travel
  history (sections table exists, 031).

## Acceptance Criteria

- [ ] Location-change transition shows user suggestion card (3 travel modes) — in-chat
      location change + transfer + join already exist in `location-panel.html`; the
      transition-detected suggestion card is still pending
- [x] Assistant travel prompt section (`src/assistant/prompt/sections/travel.ts`, wired in
      `registry.ts`) — bound/linked mode gated by `assistant.travelPrompts` config toggle
      (default off)
- [x] Prompt only references known world locations (fetches from `locations` table, capped)
- [x] `migrateChat` `carry.location` copies chat_sections + re-points message section links
      (`src/chat/service/carry-location.ts`, wired in `transitions.ts`)
- [ ] Tests: travel intent extraction → `location_change` transition regex is pending;
      carry.location unit test pending (migration-gated runtime)

## Progress (2026-08-15)

- Shipped: travel prompt section + config toggle, `carry.location` on migrate.
- Pending: transition→suggestion UI card, travel-intent regex pattern in `src/regex/`,
  migration carries `carry.location` end-to-end test.

## Files

- `src/assistant/prompt/sections/travel.ts` — prompt section (new)
- `src/assistant/prompt/assembly.ts` — wire section when toggle on
- `src/regex/` — travel intent pattern (extend extraction pipeline)
- `src/components/chat/location-panel.html` + `src/frontend/` — suggestion card
- `src/chat/service/transitions.ts` + `carry-state.ts` — `carry.location`
- `src/validation/schemas/chat.ts` — `assistantConfig.travelPrompts`, `carry.location`
- `.plan/epics/epic-chat-transfer-location.md` — update status after landing

## Notes

- Depends on FEAT-world-template-chat-lifecycle for the `world` template + feature tags
  ("linked travel" as a template feature), but the UI card and prompt section are
  independently shippable.
- Keep "in-chat" as the default suggestion (story continuity); migration only when the
  user picks "new chat at destination".
