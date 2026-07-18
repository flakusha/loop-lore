# Memory Visualization Implementation

## Overview

Interactive graph of characters ↔ locations ↔ facts. Click to inspect relationships.

## Implementation

### Graph Data Structure

```typescript
// src/memory/graph.ts
export interface MemoryNode {
  id: string;
  type: "character" | "location" | "fact" | "item";
  label: string;
  data: any;
}

export interface MemoryEdge {
  source: string;
  target: string;
  type: "knows" | "visited" | "owns" | "mentioned_in";
  strength?: number; // 0-1
}

export class MemoryGraph {
  private nodes: Map<string, MemoryNode> = new Map();
  private edges: MemoryEdge[] = [];

  async buildFromWorld(worldId: string): Promise<void> {
    // Get all actors in world
    const actors = await db
      .selectFrom("actors")
      .selectAll()
      .where("world_id", "=", worldId)
      .execute();

    // Get locations
    const locations = await db
      .selectFrom("locations")
      .selectAll()
      .where("world_id", "=", worldId)
      .execute();

    // Get lore entries
    const lore = await db
      .selectFrom("world_lore_entries")
      .selectAll()
      .where("world_id", "=", worldId)
      .execute();

    // Build nodes
    for (const actor of actors) {
      this.nodes.set(actor.id, {
        id: actor.id,
        type: "character",
        label: actor.name,
        data: actor,
      });
    }

    for (const loc of locations) {
      this.nodes.set(loc.id, {
        id: loc.id,
        type: "location",
        label: loc.name,
        data: loc,
      });
    }

    // Build edges from memories
    for (const entry of lore) {
      // Create fact node
      const factId = `fact-${entry.id}`;
      this.nodes.set(factId, {
        id: factId,
        type: "fact",
        label: entry.key,
        data: entry,
      });

      // Connect to characters who know this
      const knowingActors = await db
        .selectFrom("actor_memories")
        .select("actor_id")
        .where("memory_key", "=", entry.key)
        .execute();

      for (const { actor_id } of knowingActors) {
        this.edges.push({
          source: actor_id,
          target: factId,
          type: "knows",
        });
      }
    }

    // Build location visit edges from messages
    await this.buildVisitEdges(worldId);
  }

  private async buildVisitEdges(worldId: string): Promise<void> {
    const moves = await db
      .selectFrom("messages")
      .selectAll()
      .where("world_id", "=", worldId)
      .where("content", "like", "%moved to%")
      .execute();

    // Parse and create edges
    for (const msg of moves) {
      const match = msg.content.match(/moved to ([A-Za-z\s]+)/);
      if (match) {
        const locName = match[1];
        const loc = await db
          .selectFrom("locations")
          .selectAll()
          .where("name", "=", locName)
          .executeTakeFirst();

        if (loc) {
          this.edges.push({
            source: msg.actor_id,
            target: loc.id,
            type: "visited",
          });
        }
      }
    }
  }
}
```

### Visualization Component

```typescript
// src/frontend/alpine/memory-graph.ts
import { Network } from "vis-network/standalone";

export function useMemoryGraph() {
  return {
    network: null as Network | null,

    async init(container: HTMLElement, worldId: string) {
      const graph = new MemoryGraph();
      await graph.buildFromWorld(worldId);

      const data = {
        nodes: graph.nodes.values(),
        edges: graph.edges,
      };

      const options = {
        physics: { stabilization: false },
        interaction: { hover: true },
        nodes: {
          shape: "dot",
          size: 15,
          font: { size: 14 },
        },
      };

      this.network = new Network(container, data, options);

      this.network.on("click", (params) => {
        if (params.nodes.length) {
          this.showNodeDetail(params.nodes[0]);
        }
      });
    },

    showNodeDetail(nodeId: string) {
      const node = this.network?.getNode(nodeId);
      this.$dispatch("show-memory-detail", { node });
    },
  };
}
```

### Node Detail Panel

```html
<!-- src/components/memory-detail.html -->
<div x-show="detailNode" class="memory-detail">
  <h3 x-text="detailNode.label"></h3>

  <template x-if="detailNode.type === 'character'">
    <div>
      <p x-text="detailNode.data.description"></p>
      <h4>Known Facts</h4>
      <ul>
        <template x-for="fact in connectedFacts" :key="fact.id">
          <li x-text="fact.label"></li>
        </template>
      </ul>
    </div>
  </template>

  <template x-if="detailNode.type === 'location'">
    <div>
      <p x-text="detailNode.data.description"></p>
      <h4>Visited By</h4>
      <ul>
        <template x-for="visitor in connectedVisitors" :key="visitor.id">
          <li x-text="visitor.name"></li>
        </template>
      </ul>
    </div>
  </template>
</div>
```

## Edge Cases

- Large world (1000+ nodes) → cluster by type
- Circular references → limit depth 5
- Real-time updates → incremental graph update
- Mobile screen → simplified list view
- Graph layout explode → reset physics
- Memory not loaded → show loading spinner

## Performance

- Graph cached per world (5 min TTL)
- Nodes lazy-loaded on zoom
- Edge pruning (strength < 0.1)
- WebGL renderer for large graphs