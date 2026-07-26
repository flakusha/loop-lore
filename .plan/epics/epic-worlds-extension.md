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
