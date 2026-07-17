# Frontend: Worlds

**URLs**: `/worlds`, `/worlds/:id`, `/worlds/:id/edit`

## Overview (v1 scope)

Worlds are a first-class entity in v1. A world contains setting context (lore, atmosphere, rules) that multiple chat rooms (chats) can reference. Player actions in chat rooms contribute to the evolving story of the world.

In v1, worlds are defined by the user and linked to chats during detailed creation. Collaborative world-building (multiple users contributing to the same world) is a future feature.

## World List (`/worlds`)

### Layout

Same sidebar as chat (showing chat list). The main content area shows a list of worlds as cards (full-width, not a grid).

**Each world card**:

- World name (bold, 16px)
- Short description (one line, truncated)
- Lore summary snippet (one line, italic, secondary text color)
- Chat room count (e.g., "3 chat rooms")
- Last activity timestamp (relative)
- Click → `/worlds/:id`

**Actions header**: "Create World" button (primary), link to gallery (to link existing assets)

### States

Zero worlds: empty state with "No worlds yet. Create a world to build a shared story setting."

## World Detail (`/worlds/:id`)

### Content Sections (scrollable, single column)

**Header**: world name, description, edit button (secondary, top-right)

**Lore section** (textarea, rendered as formatted text):

- Full lore description
- Rules and constraints of the world
- Atmosphere / tone notes

### Locations Section

Worlds contain many locations. Locations form a travel graph.

**Location list**:

- Each location shows: name, short description, connection count
- Click location → expand details (description, connected locations)
- "Add Location" button opens inline form

**Location form**:

- Name (required)
- Description (textarea)
- Connections (multi-select of other locations in this world)
- Save / Cancel buttons

**Location graph view** (future):

- Visual map of connections (Forest → Cave → Tower)
- Click to navigate, drag to rearrange

**Location states** (per-chat):

- current_location_id on chat record
- When GM or player moves: update chat.current_location_id
- Location context injected into LLM prompt

**Linked chat rooms**:

- List of chats that reference this world
- Each item: character name, chat title, last message preview, "Open Chat" link
- If no chats are linked: "No chat rooms in this world yet. [Create one]" → links to character browser

**Linked assets**:

- Small grid of assets tagged to this world (thumbnails, max 6 shown, "View all" link)
- If none: "No assets linked to this world."

**Actions**: Edit (secondary), Delete (danger, with confirmation), "New Chat Room" (primary — navigates to character browser)

## World Create/Edit (`/worlds/new`, `/worlds/:id/edit`)

Single-column form, max-width 600px, centered.

**Fields**:

- Name (text input, required)
- Description (textarea, short summary for the world card)
- Lore (textarea, full setting description. No limit enforced by UI, server-side cap applies.)
- Tags (comma-separated, converted to chips)

**Locations tab** (second tab in edit view):

- List of locations with inline edit/delete
- "Add Location" button opens sub-modal
- Location form: name, description, connections (checkboxes)

**Actions**: Save (primary), Cancel (ghost). On save → redirect to `/worlds/:id`.

## States

All states follow the same patterns as the character page: loading skeletons, error banners, save spinners, validation errors.

---

## Location Gallery Items

Locations within worlds can have their own gallery assets — maps, scene
illustrations, ambient sound, or item icons. These are linked via the
polymorphic `asset_links` table with `entity_type='location'`.

### Linking Location Assets

```
asset_links {
  asset_id: <uuid>,
  entity_type: 'location',
  entity_id: <location-uuid>,
  label: 'map' | 'scene' | 'ambient' | 'icon' | custom
}
```

### How Location Assets Appear in Chat

When a chat is bound to a location, the system includes that location's
assets in the prompt context:

```
[Location Assets — {{location.name}}]
- map: /api/assets/{id}/thumb (thumbnail shown to LLM as reference)
- scene: "Dark forest with towering oaks" (alt_text from asset)
- ambient: background sound loop (audio asset)
```

The LLM can reference these assets in its narration. The frontend renders
location assets as a small gallery strip above the chat input (collapsible).

### World-Level Assets

Worlds also have gallery items (already shown in the world detail page).
World assets serve as global context — world maps, theme music, lore images.
These are linked via `asset_links { entity_type: 'world' }`.

### Asset Scope Hierarchy

```
World assets → visible in all chats within the world
Location assets → visible only in chats bound to that location
Chat assets → visible only in that specific chat
```

Location assets override world assets for the same label (e.g., if both
world and location have a `scene` asset, the location's takes precedence).

---

## Location-Scoped Chat Visibility

Group chats bound to a location can have their own visibility, independent
of the location's own visibility.

### Chat Visibility per Location

| Chat Visibility | Meaning                                               |
| --------------- | ----------------------------------------------------- |
| `public`        | Any user in the world can discover and join the chat  |
| `private`       | Only invited participants can see and access the chat |

**Default:** `public` for location-bound group chats.

### Discovery Flow

### Joining a Location Chat

- **Public:** click "Join" → automatically added as participant
- **Private:** must be invited by the chat master or an existing participant

### Location Visibility vs Chat Visibility

The location itself can be visible (users can see it exists and read its
description) while its chats are private (users cannot access the conversations).
This separation lets locations be discoverable while keeping specific
conversations restricted.

---

## Search & Filters

All entity list screens support consistent search and filter patterns.

### Worlds List (`/worlds`)

- **Search:** text input, debounced, filters by world name
- **Filters:** tag chips (from world tags), "All" / "My Worlds" toggle

### Location Detail (within world)

- **Search:** text input, filters by location name
- **Filters:** none needed (locations are small in number per world)

### Chat List (within world or character)

- **Search:** text input, filters by chat name
- **Filters:** chat type (1x1, group), visibility (private, public), by world

---

## World Activity Timeline

A chronological feed of all significant events within a world. Serves as
a "world history book" for recap, onboarding, and debugging.

### Event Types

| Event                | Description                                                   | Source         |
| -------------------- | ------------------------------------------------------------- | -------------- |
| `chat_created`       | New chat started in the world                                 | system         |
| `chat_message`       | Message sent (optional — only if world-level logging enabled) | user/character |
| `item_transfer`      | Item moved between actors                                     | GM tool call   |
| `quest_started`      | Quest accepted                                                | GM tool call   |
| `quest_completed`    | Quest finished                                                | GM tool call   |
| `location_entered`   | Actor moved to a new location                                 | GM tool call   |
| `status_applied`     | Status effect applied to actor                                | GM tool call   |
| `relationship_shift` | Standing changed between actors                               | GM tool call   |
| `rule_created`       | Chat rule added                                               | GM / LLM       |
| `world_state_edit`   | World state modified                                          | GM tool call   |

### Timeline UI

On the world detail page, a "Timeline" tab shows events in reverse
chronological order. Each entry shows:

- Timestamp (relative: "2 hours ago")
- Event type icon
- Actor name + action summary
- Linked entity (chat, quest, item, location) — clickable

**Filters:** event type, actor, date range. **Pagination:** 50 events per page.

### Storage (Proposed)

Table: `world_events`

| Column      | Type | Notes                                            |
| ----------- | ---- | ------------------------------------------------ |
| id          | TEXT | PK, UUID                                         |
| world_id    | TEXT | FK → worlds.id                                   |
| event_type  | TEXT | One of the event types above                     |
| actor_id    | TEXT | FK → actors.id (who triggered it)                |
| target_id   | TEXT | FK → related entity (nullable)                   |
| target_type | TEXT | 'chat' / 'quest' / 'item' / 'actor' / 'location' |
| data        | TEXT | JSON event-specific payload                      |
| created_at  | TEXT | DEFAULT CURRENT_TIMESTAMP                        |

---

## Location Navigation & Travel

How actors move between locations within a world. Extends the location
graph (connections) defined in the world detail.

### Travel Model

When an actor moves from Location A to Location B:

1. **Connection check** — A and B must be connected (direct edge in the
   location graph). Indirect travel requires multiple hops.
2. **Travel time** — each connection has an optional `travel_cost` (default: 1
   turn). The GM or world author can set costs per connection.
3. **Encounters** (optional) — the GM can define random encounter tables per
   connection. During travel, the engine rolls against the table.

### Connection Properties

Each location connection can have metadata:

### Travel in Chat

When a player says "I walk to the cave," the GM tool call moves the actor:

```
[TOOL_CALL]
{
  "tool": "location_move",
  "params": {
    "actor_id": "player_01",
    "from_location_id": "forest",
    "to_location_id": "cave",
    "travel_cost": 2
  },
  "narrative": "You follow the path for two hours before reaching the cave mouth."
}
[/TOOL_CALL]
```

The engine updates `chat.current_location_id` and injects the new location's
context into subsequent prompts.

### Fast Travel (Future)

Locations can be tagged as "fast travel points." Once discovered, actors can
travel directly between fast travel points regardless of graph distance.
Useful for large worlds with many locations.

### Movement Costs (Optional, GM-Configurable)

The GM can override default movement costs per world:

- **Cautious pace:** 2x travel cost, advantage on perception checks
- **Normal pace:** 1x travel cost, no modifiers
- **Fast pace:** 0.5x travel cost, disadvantage on stealth checks

---

## Collaborative World Building

Multiple users can contribute to the same world. This section defines the
collaboration model.

### Contribution Roles

| Role         | Permissions                                                                 |
| ------------ | --------------------------------------------------------------------------- |
| World Owner  | Full control: edit world, manage locations, approve changes, manage members |
| World Editor | Can add/edit locations, lore entries, item definitions                      |
| World Viewer | Read-only: can browse world, join chats, view timeline                      |

### Edit Model

- **Optimistic locking** — each world record has a `version` integer. On save,
  the client sends the version it read. If the DB version differs, the save
  is rejected with "This world was modified by another user. Please reload."
- **No real-time collab** — this is not Google Docs. Users edit sequentially.
  The version check prevents lost updates.

### Approval Queue (Optional)

For worlds with strict quality control, edits from non-owners go into an
approval queue:

1. Editor submits change (new location, lore edit, item definition)
2. Change is stored as `pending` with a diff preview
3. World owner reviews and approves/rejects
4. Approved changes become `active`

This is optional — most worlds will allow editors to save directly.

### Conflict Resolution

When two editors modify the same location simultaneously:

1. First save succeeds (version matches)
2. Second save fails (version mismatch)
3. Second editor sees: "Location was modified by [name] since you started
   editing. Your changes were not saved. Please reload and re-apply."

No merge strategy — the second editor must manually reconcile.

---

## World Statistics Dashboard

GM-facing analytics for balancing and monitoring world health.

### Metrics

| Metric                   | Description                                 | Computation                             |
| ------------------------ | ------------------------------------------- | --------------------------------------- |
| Messages per character   | Activity distribution across characters     | COUNT(messages) GROUP BY actor          |
| Item economy flow        | Gold sources vs sinks over time             | SUM(transfers) by type                  |
| Quest completion rate    | Completed vs active vs failed quests        | COUNT(quests) by status                 |
| Location visit frequency | How often each location is visited          | COUNT(location_moves) GROUP BY location |
| Combat win/loss ratio    | Outcomes of GM-resolved combats             | COUNT(combat_results) by outcome        |
| Session duration         | Average time spent per chat session         | AVG(session_length)                     |
| Character progression    | Level distribution across active characters | AVG(level) GROUP BY character           |

### Dashboard UI

On the world detail page, a "Stats" tab (GM only) shows:

- **Activity chart** — messages per day/week, stacked by character
- **Economy graph** — gold flow over time (sources green, sinks red)
- **Quest board** — active/completed/failed counts with completion %
- **Location heatmap** — visual map with visit frequency overlays
- **Character roster** — level, XP, item count, session count per character

### Data Collection

Stats are computed from existing data (messages, tool calls, quest records).
No separate analytics table needed for MVP — queries run on demand.
For performance, a materialized `world_stats_cache` table can be added later.

---

## Export & Sharing

See [chat/export.md](./chat/export.md) for chat export functionality.

World-level export: export entire world (locations, lore, items, timeline)
as a JSON bundle for backup or sharing with other instances.

```
GET /api/worlds/:id/export
Response: 200
{
  "spec": "loop-lore-world-v1",
  "world": { ...world data... },
  "locations": [ ... ],
  "lore_entries": [ ... ],
  "items": [ ... ],
  "timeline": [ ... ]
}
```

Import via `POST /api/worlds/import` with the same JSON structure.

---

## Prompt Debug View

A "nerd mode" toggle in the chat UI that exposes the full assembled prompt
for debugging. Accessible via chat header menu → "Show Prompt" or keyboard
shortcut `Ctrl+Shift+P`.

### What It Shows

The complete prompt sent to the LLM, broken into labeled sections:

```
=== SYSTEM ===
You are Lyra. You are a powerful mage...

=== CHARACTER CARD ===
Description: Lyra is a half-elf wizard...
Personality: Curious, playful, slightly reckless...

=== STATS ===
Level 5 Half-Elf Wizard
HP: 28/35 | MP: 18/20
STR 8 (-1) | DEX 14 (+2) | CON 14 (+2) | INT 18 (+4) | WIS 12 (+1) | CHA 13 (+1)

=== EQUIPMENT ===
Main Hand: Quarterstaff (1d6 bludgeoning)
Chest: Robes (+1 AC)
Ring: Ring of Protection (+1 AC)

=== ACTIVE RULES ===
- No Magic Zone (Location): Spellcasting prohibited
- Difficulty: Normal (DC modifier: 1.0x)

=== LOCATION ===
You are in the Ancient Library. Dusty tomes line the walls from floor to ceiling...

=== MEMORIES ===
- Met Alice in Ironhold Market (importance: 8)
- Defeated the goblin chief (importance: 7)

=== LOREBOOK ===
- Ancient Library: A repository of forbidden knowledge...

=== QUESTS ===
- "Find the Lost Tome" (active, 2/5 steps)

=== RELATIONSHIPS ===
- Alice: Friendly (+45)
- Goblin Chief: Hostile (-60)

=== CHAT HISTORY ===
[user] I search the shelves for any mention of the tome.
[character] The shelves groan under your weight as you reach for a leather-bound volume...
```

### Implementation Notes

- Prompt assembly already builds these sections — the debug view renders
  the intermediate data before it's serialized for the LLM call
- Read-only, no mutation
- Toggle persists per-chat in localStorage
- Token count displayed per section (helps identify which sections consume
  the most context budget)
