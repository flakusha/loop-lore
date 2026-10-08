<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Transfer & Location Change — Implementation

**Summary:** Implement chat transfer between locations - in-chat location change, transfer to another location, create-chat-at-location, and join-existing-chat - plus VN scene transitions on location change and chat sectioning.
**Context:** Builds on the already-shipped `PUT /api/chats/:id/location`, `POST /api/chats/:id/transfer`, `POST /api/chats/:id/join`, `GET /api/chats/joinable`, and the regex transition classifier. Sectioning shipped in a different shape than this ticket's original DDL (event-log + `label/sort_index/location_id`), so Steps 1-2 are superseded - see the Code Verification section below.
**Acceptance Criteria:** `chat_sections` table and `messages.section_id` exist; section-aware message queries work; location change records an event and auto-syncs the chat background; join returns location/section context; transfer records an event; VN transition fires on location change; create-chat-at-location works end-to-end; existing chat tests pass.


**Status:** in_progress
**Status Note:** sectioning, location-event log, party join/leave and split/reunite shipped on dev; transfer event wiring, join location context, and VN renderer wiring are unmerged work in worktree `tree/epic-transfer-location` (not on dev).
**Priority:** P2-B
**Effort:** Medium
**Epic:** epic-chat-transfer-location
**Tags:** chat, location, travel, transfer, sectioning

## Summary

Implement the three location-change modes (in-chat, new chat, join existing)
and wire VN transitions to location changes. Builds on existing endpoints.

## What Exists

| Component                      | Status | Notes                                      |
| ------------------------------ | ------ | ------------------------------------------ |
| `PUT /api/chats/:id/location`  | ✅     | Simple `current_location_id` update        |
| `POST /api/chats/:id/transfer` | ✅     | Transfer to location (same world)          |
| `POST /api/chats/:id/join`     | ✅     | Add user as participant                    |
| `GET /api/chats/joinable`      | ✅     | Discover chats at location                 |
| Transition detection           | ✅     | Regex-based in `chat/transitions.ts`       |
| `ChatTransition` type          | ✅     | Has `location_change` variant              |
| VN scene renderer              | ✅     | Has transition effects (fade/cut/dissolve) |
| Chat sections                  | ❌     | No DB table, no section logic              |
| VN location transition         | ❌     | No wiring between location change and VN   |

## Implementation Plan

### Step 1: Chat Sections Table

Create migration for `chat_sections` table and add `section_id` to messages.

```sql
CREATE TABLE chat_sections (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id),
  world_id TEXT NOT NULL REFERENCES worlds(id),
  section_order INTEGER NOT NULL,
  title TEXT,
  transition_type TEXT CHECK (transition_type IN ('walk','teleport','cutscene','combat','choice','narrative')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE INDEX idx_sections_chat ON chat_sections(chat_id);
CREATE INDEX idx_sections_location ON chat_sections(location_id);
```

Add to messages table:

```sql
ALTER TABLE messages ADD COLUMN section_id TEXT REFERENCES chat_sections(id);
CREATE INDEX idx_messages_section ON messages(section_id);
```

### Step 2: Section Service

Add to `src/chat/service.ts`:

```typescript
export async function createSection(db, chatId, locationId, worldId, transitionType) { ... }
export async function endCurrentSection(db, chatId) { ... }
export async function getCurrentSection(db, chatId) { ... }
export async function listSections(db, chatId) { ... }
```

### Step 3: Wire Location Change to Event/Background Lifecycle (SHIPPED for PUT; transfer in flight)

> ✅ `PUT /api/chats/:id/location` already does: transaction → `recordLocationChange` → `autoSyncChatBackground` (`src/routes/chats/extras.ts:96-113`).
> 🔧 NOT ON DEV: `POST /api/chats/:id/transfer` does NOT yet get the SAME lifecycle. On dev HEAD `29602550b`, `src/routes/chat-search/transfer.ts` updates `current_location_id` with no `recordLocationChange` call. The equivalent wiring is unmerged work in worktree `tree/epic-transfer-location`.

### Step 4: VN Transition Integration (trigger shipped; renderer wiring in flight)

> ✅ `on_location_change` trigger + `evaluateTriggers` + transition engine (fade/cut/dissolve) exist.
> 🔧 NOT ON DEV: a browser-side ledger (`src/frontend/vn/location-events.ts`, `saveLastLocation`/`getLocationContext`) plus scene-renderer wiring is unmerged work in worktree `tree/epic-transfer-location` (branch behind dev, no commits of its own). The file exists there and as an untracked file in this checkout's working tree, but is not committed on dev HEAD `29602550b`. Do not treat it as shipped.
> Ambient-sound crossfade remains open (no sound system wired to sections).

### Step 5: "Create Chat at Location" Flow

New endpoint or extension to existing chat creation:

```typescript
POST /api/chats/:id/create-at-location
  body: { locationId: string, name?: string }
```

Logic:

1. Copy participants from source chat
2. Create new chat with `parent_chat_id = sourceChatId`
3. Set `current_location_id` to target
4. Create initial section at target location
5. Post transition narration in both chats
6. Return new chat ID

### Step 6: "Join Existing Chat" Flow

Already exists via `POST /api/chats/:id/join`. Enhance:

1. Return section history when joining (so UI knows location context)
2. Post "character joined" narration
3. VN entrance animation trigger

### Step 7: Section-Aware Message Queries

Modify `listMessages` in `chat/service.ts`:

- Add optional `sectionId` filter
- Return section metadata alongside messages
- Support "load by section" for infinite scroll

## Files to Create

> Superseded — the chat_sections table and section CRUD both landed on `dev` in
> a different shape than this ticket designed (see Code Verification below). No
> files below remain to be created.

- ~~`src/db/migrations/031_chat_sections.ts`~~ — never existed; `chat_sections` and
  `chat_location_events` were both folded into `src/db/migrations/001_init.ts`
- ~~`src/routes/chat-sections.ts`~~ — shipped as the directory
  `src/routes/chat-sections/` (access/assign/bulk/create/list/narrative/remove/reorder/update)

## Files to Modify

> Paths corrected against dev HEAD `29602550b`; several were stale post-refactor
> (flat modules became directories, and `src/chat/types.ts` became `src/chat/types/`).

- `src/db/schema-core.ts` — `ChatSections` interface (SHIPPED)
- `src/db/schema-manifest.ts` — regenerate (SHIPPED)
- `src/chat/service/location-events.ts` — SHIPPED `recordLocationChange` + `getLocationHistory`
  (the event-log model that replaced this ticket's planned `src/chat/service.ts`
  section CRUD; both exported from `src/chat/service/index.ts:138`)
- `src/chat/types/` — section/location types (SHIPPED as `src/chat/types/transitions.ts`)
- `src/routes/chats/extras.ts` — section-aware location update (SHIPPED)
- `src/routes/chat-search/transfer.ts` — extend transfer with event recording (OPEN on dev)
- `src/chat/transitions.ts` — emit section events
- `src/frontend/vn/scene-renderer/` — handle location transition events (directory, not `scene-renderer.ts`)
- `src/frontend/vn/choice-cards.ts` — location choice cards

## Acceptance Criteria

- [x] `chat_sections` table created with proper schema (shipped shape: label/sort_index/location_id/background_id — NOT the ticket DDL; both `chat_sections` and `chat_location_events` live in `src/db/migrations/001_init.ts`)
- [x] `messages.section_id` column added
- [ ] Location change creates new section automatically — superseded by event-log model; `POST /:id/transfer` still records no event on dev
- [ ] Section-aware message queries work — section CRUD/assign/reorder + frontend dividers shipped (`src/routes/chat-sections/`, `src/frontend/alpine/chat-sections.ts`), but the Step 7 `sectionId` filter on `listMessages` (`src/chat/service/read.ts:58`) is NOT implemented
- [ ] VN transition fires on location change — trigger + engine shipped; renderer wiring is unmerged work in `tree/epic-transfer-location`, not on dev
- [ ] "Create chat at location" flow works end-to-end — open (no `POST /:id/create-at-location` route)
- [ ] "Join existing chat" returns section context — NOT on dev: `src/routes/chat-search/join.ts:92` returns only `{ chatId, joined: true }`, no section/location history. The version that returns location history is unmerged work in `tree/epic-transfer-location`
- [ ] Background/sound sync per section — background half shipped (`autoSyncChatBackground` on `PUT /:id/location`); ambient-sound half open, no sound system wired to sections
- [ ] All existing chat tests still pass

## Code Verification 2026-10-08

Verified against the `dev` HEAD `29602550b` source tree (`git ls-tree`/`git grep` against
that ref, not the dirty working tree — a concurrent migration edits `src/` here):
- Phase 1: sectioning shipped to a DIFFERENT but sufficient shape than the ticket's DDL — `chat_sections(label, description, location_id NULLABLE, sort_index, background_id)` + `messages.section_id` + `chat_location_events` append-only log + full section CRUD (`src/routes/chat-sections/`: access/assign/bulk/create/list/narrative/remove/reorder/update) + frontend section nav/panel/dividers + migration-carry (`carryHistory`/`carryLocation`) + `autoSyncChatBackground` wired to `PUT /:id/location` (`src/routes/chats/extras.ts:110-112`). Do NOT re-run this ticket's Step 1 DDL — superseded.
- Phase 2: party join/leave shipped (`joinParty`/`leaveParty` in `src/chat/service/party.ts`, routes in `src/routes/chats/participants.ts`, guest role enum, idempotent rejoin). Open: VN renderer entrance/exit animation wiring + character state snapshot on leave.
- Phase 3: split/reunite shipped (`splitParty`/`reuniteChats` in `src/chat/service/split.ts`, routes `POST /api/chats/:id/split` + `/reunite` in `src/routes/chats/split.ts` with IDOR-safe actorId guard, carried context via `carry-*` modules). Open: regex split/reunite narration detection, VN split/reunite visual effects.
- Phase 4: "create chat at location" flow NOT shipped (no `POST /:id/create-at-location` route). Join-flow location context NOT on dev either — `src/routes/chat-search/join.ts` returns `{ chatId, joined: true }` only; the location-history version is unmerged work in worktree `tree/epic-transfer-location`.
- VN: `on_location_change` transition trigger + transition engine using `VnTriggerContext.currentLocationId/previousLocationId` SHIPPED; scene-renderer wiring for background/ambient sync NOT shipped on dev — the frontend ledger (`src/frontend/vn/location-events.ts`) exists only as unmerged work in `tree/epic-transfer-location` (and as an untracked file in this checkout), never committed.

## Remaining delta after this session's in-flight slices (transfer event wiring, join context, VN ledger+renderer hook)


## Verification 2026-09-26

Verdict: **still-open-expanded** (foundation overshot the ticket design in places; auto-section + VN wiring still missing; recommend needs-split on close pass).

Src checked:
- `PUT /api/chats/:id/location` (`src/routes/chats/extras.ts:36-101`, incl. background auto-sync test `chat-backgrounds.test.ts:222`), `POST /api/chats/:id/transfer` (`src/routes/chat-search/transfer.ts` — same-world check, updates `current_location_id`), `POST /api/chats/:id/join` + `GET /api/chats/joinable` (`src/routes/chat-search/`), transition classifier (`src/chat/transition-classifier.ts`, regex-first + AUX fallback) — all ✅.
- `chat_sections` + `messages.section_id` SHIPPED but with a different schema than the ticket's Step 1: actual `ChatSections` (`src/db/schema-core.ts:620-629`) is `{id, chat_id, label, description, location_id, sort_index, created_at, updated_at, background_id}` — no `world_id/section_order/title/transition_type/started_at/ended_at`. Full CRUD + assign + reorder + narrative routes (`src/routes/chat-sections/`), frontend (`chat-types/location-state.ts`, `chat-sections.ts`, `sections-panel.html`, `message-list.html:79-99` dividers), `carryHistory`/`carryLocation` remap, `recordLocationChange(..., {sectionId})` (`src/chat/service/location-events.ts:40-54`) — all beyond the ticket.
- MISSING vs ticket Steps 3-6: `transfer.ts:63-71` updates location WITHOUT creating/ending a section and emits no `chat.location_changed` event; no `POST /create-at-location` flow (participants copy + `parent_chat_id` + dual narration); join does not return section history; VN side is only the `on_location_change` template trigger (`src/frontend/vn/templates/transition-triggers.ts:42`) — no scene-renderer background/sound sync on location change.

Refreshed deltas:
- Rewrite Steps 1-2 (schema + service) to match the shipped `label/sort_index/location_id` shape instead of the ticket's `section_order/transition_type` DDL — do not run the ticket's migration verbatim.
- Remaining: auto-section lifecycle on location/transfer, create-at-location flow, join-returns-sections, VN transition event → scene renderer. Each is an independent slice (needs-split candidate).

### Deep research: what changed since this ticket was written

- Ticket design assumed NO section infrastructure (`chat_sections`: "❌ No DB table, no section logic"). Since then the section system was built to a different shape: `chat_sections(label, description, location_id NULLABLE, sort_index)` + `messages.section_id` + `chat_location_events(section_id, from/to_location_id, triggering_message_id, source)` + full section CRUD/assign/reorder/narrative routes + frontend section nav/panel/dividers + migration-carry (`carryHistory`/`carryLocation`) + background auto-sync on location PUT. Location changes are recorded as *events* (`recordLocationChange`) optionally linked to a section, not as ticket-proposed section-lifecycle (end-current + create-new inside the location/transfer handlers). The transfer route is a bare `current_location_id` update with no event, no section, no narration. So the ticket's Steps 3-4 (wire location change → section creation → VN event) are the live gap, while Steps 1-2/7 (table + service + section-aware queries) are superseded by the shipped equivalents and must not be re-implemented from the ticket text.
