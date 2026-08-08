# EPIC: Worlds Extension (Shareability, Epochs, Maps, Mode Switches)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Issue:** `6c84baa`
**Type:** Feature Epic
**Tags:** worlds, shareability, license, epochs, maps, mode-switch

## Overview

Extends the World & Locations foundation (see `epic-world-locations.md`, which
already covers cataclysms, events, and propagation). This epic adds the
_social / temporal / spatial / interaction_ layers that epic does not:

- **Shareability** — license, attribution, allowed/prohibited use
- **Global time scale** — epochs, scale size, related memories
- **Maps** — 2D / 3D map representations
- **Location assets** — items, unique items, resources generation + tracking
- **Chat mode switches** — battle / question / inventory interaction modes

## Shareability & Licensing

| Aspect         | Description                                |
| -------------- | ------------------------------------------ |
| Shareability   | Export / import worlds between users       |
| License        | SPDX or custom license attached to a world |
| Attribution    | Author credit retained on share            |
| Allowed use    | Permitted derivative / commercial use      |
| Prohibited use | Banned remix / redistro patterns           |

```typescript
interface WorldLicense {
  world_id: string;
  spdx_or_custom: string;
  attribution: ActorRef[];
  allowed_use: UseFlag[];
  prohibited_use: UseFlag[];
}
```

## Global Time Scale

| Concept          | Description                            |
| ---------------- | -------------------------------------- |
| Epochs           | Named eras partitioning world history  |
| Scale size       | Relative time compression vs real time |
| Related memories | Memories tagged to epoch / timescale   |

```typescript
interface WorldTimeScale {
  world_id: string;
  epoch: string;
  scale_size: number; // world-minutes per real-minute
  epoch_memories: MemoryRef[];
}
```

## Maps (2D / 3D)

| Representation | Use                                     |
| -------------- | --------------------------------------- |
| 2D map         | Top-down navigation, regions            |
| 3D map         | Spatial exploration, in-app interaction |

## Location Assets & Resources

| Asset        | Tracking                              |
| ------------ | ------------------------------------- |
| Items        | Spawned at location, inventory-linked |
| Unique items | Single-instance, world-scoped         |
| Resources    | Renewable / depletable pools          |

```typescript
interface LocationResource {
  location_id: string;
  kind: "item" | "unique_item" | "resource";
  amount: number;
  regen?: ResourceRegen;
}
```

## Chat Mode Switches

| Mode      | Behavior                      |
| --------- | ----------------------------- |
| Battle    | Route to combat orchestration |
| Question  | Q&A / lore mode               |
| Inventory | Item management interactions  |

```typescript
type ChatMode = "normal" | "battle" | "question" | "inventory";
```

## Tasks

- [ ] World license + attribution model
- [ ] Allowed / prohibited use flags + enforcement on share
- [ ] Epoch + time-scale engine
- [ ] 2D / 3D map data model + render hooks
- [ ] Location asset / resource generation + tracking
- [ ] Unique-item world scoping
- [ ] Chat mode switch state machine + routing

## Files

- `src/worlds/license.ts` — shareability + licensing
- `src/worlds/timescale.ts` — epochs + scale
- `src/worlds/maps.ts` — 2D / 3D map model
- `src/worlds/resources.ts` — location assets + resources
- `src/chat/mode-switch.ts` — chat mode routing
- `src/db/schema.ts` — world_license, world_timescale, location_resource tables

## Linked Tasks

- TASK-worlds-extension.md
- TASK-world-shaping-divine.md

---

## Merged from `.plan/epics/epic-worlds-extension.md`

# Refinement: Chat-as-World Navigation

## Key Improvements

- **Map Integration**: Embed chat in 3D world maps (like Mapbox + Discord chat).
- **Location Tags**: Allow users to tag locations with keywords for search (e.g., "#quest_start").
- **NPC Dialogue Trees**: Pre-scripted NPC responses tied to location context.

## Technical Considerations

```typescript
interface LocationTag {
  id: string;
  locationId: string;
  keywords: string[];
  messageId?: string; // linked chat message
}
```


---

## Merged from `.plan/epics/epic-worlds-extension.md`

# Refinement: Cross-World Chat Synchronization

## Key Improvements

- **Event-Driven Sync**: Use WebSocket event streams for real-time sync across worlds.
- **Conflict Resolution**: Implement vector clocks for message conflict resolution across worlds.
- **Analytics Dashboard**: Track cross-world metrics (e.g., "most forwarded message across worlds").

## Technical Considerations

```typescript
interface WorldMessage {
  id: string;
  worldId: string;
  content: string;
  timestamp: number;
  vectorClock: Record<string, number>; // for conflict resolution
}
```


---

## Merged from `.plan/epics/epic-worlds-extension.md`

# Refinement: Decentralized Chat Networks

## Key Improvements

- **Mesh Protocol**: Implement a gossip protocol for cross-world message propagation.
- **Federated Identity**: Users own their identity across worlds (like Matrix federation).
- **Reputation Ledger**: Track cross-world reputation on-chain (blockchain-inspired, not necessarily blockchain).

## Technical Considerations

```
World A <-> Mesh Gateway <-> World B
  |                          |
  v                          v
User X's reputation follows X across worlds
```


---

## Merged from `.plan/epics/epic-worlds-extension.md`

# Refinement: Location-Based Chat States

## Key Improvements

- **Command Context Registry**: Map commands to locations via `location_commands` table (e.g., `/trade` only in "market" locations).
- **Ambient State Sync**: Use WebSocket to push location-specific effects (music, weather) to all clients in that location.
- **Achievement Triggers**: Hook into `location_visit` events (already in epic-achievements.md) for auto-unlock.

## Technical Considerations

```typescript
// Example command-location mapping
const locationCommands = {
  market: ["/trade", "/buy", "/sell",],
  tavern: ["/drink", "/gamble", "/rumor",],
  dungeon: ["/explore", "/loot", "/rest",],
};
```


---

## Merged from `.plan/epics/epic-worlds-extension.md`

# Refinement: World-as-Chat Ecosystem

## Key Improvements

- **Channel Hierarchy**: Implement nested channels (like Discord) for world locations (e.g., "Bank/ATM", "Guild HQ/Meeting Room").
- **Moderation API**: Add `/world moderation` commands to set rules per channel (e.g., "block_magic_in_chat: true").
- **Cross-World Mentioning**: Allow users to mention world-specific roles (e.g., @bank_guild_master) across worlds.

## Technical Considerations

```bash
# Example moderation rules file structure
[channel:bank/atm]
  permissions:
    - allow: [guild_members, admins]
    - block: [guest_users]
```


---

## Merged from `.plan/epics/epic-worlds-extension.md`

# Refinement: World-Changing Chat Commands

## Key Improvements

- **Command Parser**: Implement a DSL (domain-specific language) for world-modifying commands.
- **Safety Checks**: Validate commands against world state (e.g., "cannot spawn dragon if dragon already exists").
- **Undo/Redo**: Support undo/redo for world-changing commands (like Figma history).

## Technical Considerations

```bash
# Example command DSL
cmd: create_item
  parameters:
    name: string
    type: item_type
    location: location_id
  preconditions:
    - location_exists
    - item_type_allowed
  postconditions:
    - item_created
    - notify_subscribers
```


---

## Merged from `.plan/epics/epic-worlds-extension.md`

# Far-Fetched Extensions: World/Location/Chat Reuse

## Overview

Speculative concepts for reusing existing chat, world, and location features in loop-lore, inspired by Discord, Telegram, and Slack.

## 1. World-as-Chat Ecosystem

- **Dynamic World Channels**: Treat each world as a server with customizable channels (locations) and permissions.
- **World Moderation**: Admin-defined rules for chat behavior, loot distribution, or NPC interactions per world.
- **Cross-World Messaging**: Enable messages to propagate between worlds, similar to Telegram’s mention system.

## 2. Location-Based Chat States

- **Location-Specific Commands**: Commands (e.g., `/trade`) activate only in certain locations.
- **Ambient Chat Effects**: Background music or visual effects change based on the current location.
- **Location-Linked Achievements**: Unlock achievements by interacting with specific locations.

## 3. Decentralized Chat Networks

- **Mesh Channels**: Allow users to join worlds without platform lock-in, enabling cross-world communication.
- **World-Specific Roles**: Roles (e.g., “merchant”) granting permissions across multiple worlds.
- **World Reputation Systems**: Track user standing in different worlds (e.g., “trusted trader”).

## 4. World Lorebooks as Shared Assets

- **Collaborative Lorebooks**: Multi-user editing of world lore, similar to Google Docs.
- **Lore-Driven Chat Filters**: Auto-filter messages based on lore keywords to trigger responses.
- **Cross-World Lore Integration**: Link lore across worlds (e.g., artifacts affecting multiple locations).

## 5. Chat-as-World Navigation

- **Chat-Embedded Maps**: Pin messages to specific map locations for quest markers.
- **Location-Based Chat Threads**: Separate chat threads per location, like Discord channels.
- **NPC Chat Bots**: Place AI NPCs in locations for interactive chat-driven events.

## 6. World-Specific Chat Moderation

- **Auto-Moderation Rules**: Keyword filters per world (e.g., block profanity in “safe zone” worlds).
- **Role-Based Permissions**: Roles like “admin” controlling chat actions in a world.
- **Chat Thread Locking**: Freeze chat during critical events (e.g., battles).

## 7. Cross-World Chat Synchronization

- **Multi-World Broadcasts**: Send a single message to all connected worlds.
- **World Chat History Sync**: Share chat history between worlds for consistent context.
- **World Chat Analytics**: Track activity metrics across worlds (e.g., “most active location”).

## 8. World-Changing Chat Commands

- **Dynamic World Edits**: Commands like `/add-treasure` modify location states.
- **Chat-Driven World Events**: Trigger events (e.g., storms) based on chat activity thresholds.
- **User-Generated World Content**: Allow chat submissions to create new landmarks or features.

---

_These ideas are intentionally speculative and should be revisited during planning sessions to assess feasibility and alignment with project goals._


---

## Merged from `.plan/epics/epic-worlds-extension.md`

# Refinement: World Lorebooks as Shared Assets

## Key Improvements

- **Real-Time Collaboration**: Use Yjs (JavaScript CRDT) for conflict-free editing across multiple users.
- **Version Control**: Snapshot lorebook changes for rollback (like Git commits).
- **AI Enhancement**: Auto-generate lorebook entries from world events (e.g., "Dragon attacked the village" → lorebook entry).

## Technical Considerations

```bash
# Example CRDT structure for collaborative editing
{
  "id": "lorebook_entry_123",
  "content": "The dragon's hoard contained...",
  "author": "user_456",
  "timestamp": "2026-08-05T12:00:00Z",
  "conflicts": []
}
```


---

## Merged from `.plan/epics/epic-worlds-extension.md`

# Refinement: World-Specific Chat Moderation

## Key Improvements

- **Rule Engine**: Implement a lightweight rule engine (like Apache Flink) for real-time moderation.
- **Context-Aware Filtering**: Block messages based on location + time + user role (e.g., "block swear words in tavern during night").
- **Appeal System**: Users can appeal moderation actions with context (e.g., "I was using the word in a quote").

## Technical Considerations

```yaml
# Example context-aware rule
rule: block_swear_words
  conditions:
    location: tavern
    time: night
    role: guest_user
  action: kick_user
```

