# Shared Persistent Worlds Implementation

## Overview

Multiplayer co-op storytelling on one world with CRDT sync.

## Implementation

### CRDT Document for World State

```typescript
// src/crdt/world-document.ts
import { Doc, List, Map as YMap } from "yjs";

export class SharedWorldDocument {
  private doc: Doc;
  private state: YMap<any>;
  private actors: List<any>;

  constructor(worldId: string) {
    this.doc = new Doc();
    this.doc.name = `world-${worldId}`;

    this.state = this.doc.getMap("state");
    this.actors = this.doc.getArray("actors");
  }

  updateActor(actorId: string, updates: Partial<ActorState>) {
    const index = this.actors.toArray().findIndex(a => a.id === actorId);
    if (index >= 0) {
      this.actors.delete(index, 1);
    }
    this.actors.push([{ id: actorId, ...updates }]);
  }

  onUpdate(callback: (update: any) => void) {
    this.doc.on("update", callback);
  }

  connect(provider: WebsocketProvider) {
    provider.doc = this.doc;
  }
}
```

### WebSocket Sync

```typescript
// src/transport/websocket-world.ts
export function createWorldSync(
  worldId: string,
  userId: string
): WebsocketProvider {
  const ws = new WebsocketProvider(
    `ws://${location.host}/ws/world/${worldId}`,
    worldId,
    new Doc()
  );

  // Send presence
  ws.on("status", ({ status }) => {
    if (status === "connected") {
      sendPresence(userId, "online");
    }
  });

  // Receive updates
  ws.on("sync", (update) => {
    applyWorldUpdate(update);
  });

  return ws;
}

function sendPresence(userId: string, status: string) {
  // Broadcast to other participants
  ws.send(JSON.stringify({
    type: "presence",
    userId,
    status,
  }));
}
```

### Conflict Resolution

```typescript
// Last-write-wins with timestamps
export function resolveActorState(
  local: ActorState,
  remote: ActorState
): ActorState {
  // Compare modification times
  if (local.updated_at > remote.updated_at) {
    return local;
  }
  return remote;
}

// Merge stats (additive)
export function mergeStats(
  local: Stats,
  remote: Stats
): Stats {
  return {
    ...local,
    ...remote,
    // For numeric stats, take max
    hp: Math.max(local.hp, remote.hp),
    // For inventory, merge
    inventory: [...new Set([...local.inventory, ...remote.inventory])],
  };
}
```

### Presence Indicators

```typescript
// src/frontend/alpine/presence.ts
export function usePresence() {
  return {
    participants: [],

    init() {
      this.presence = new SharedWorldDocument(this.worldId);
      this.presence.onUpdate(this.handleUpdate.bind(this));
    },

    handleUpdate(update) {
      const actors = this.presence.actors.toArray();
      this.participants = actors.map(actor => ({
        ...actor,
        isOnline: actor.last_seen > Date.now() - 300000, // 5 min
      }));
    },
  };
}
```

## Edge Cases

- Network partition → local changes queued, merge on reconnect
- Conflicting edits → last-write-wins
- User leaves mid-edit → auto-save to DB
- Too many participants → rate limit updates
- CRDT size grows → garbage collect old history
- Malicious update → validate before applying

## Security

- World owner can remove participants
- Read-only mode for some participants
- Admin can freeze world state
- All changes logged for audit