# Memory, Continuity & Living World

Ideas that make the world feel persistent and consistent. Inspiration: RisuAI
long-term memory, community "alive world" requests.

## #10 Lore-consistency checker

- **Inspiration**: novel / frequently requested
- **What**: RAG over world state + lorebook; flags when the model introduces facts that
  contradict established lore/characters.
- **Fits**: `docs/spec/memory-system.md` (semantic memory) + `docs/spec/artifacts-system.md`.
- **Effort**: High
- **Depends on**: unbuilt memory-system engine, embeddings

## #11 Relationship-drift timeline

- **Inspiration**: roadmap relationships
- **What**: Visual timeline/graph of how NPC disposition toward the user changed; feeds
  generation.
- **Fits**: `WorldActorState.relationships` (dynamic per-world state).
- **Effort**: Med
- **Depends on**: relationship tracking in RPG engine

## #12 Cross-chat global memory

- **Inspiration**: community request
- **What**: "The character remembers you" across different worlds/chats via a global
  persona memory.
- **Fits**: `procedural memory` in `actor.settings.memory` (`docs/spec/memory-system.md`).
- **Effort**: Med
- **Depends on**: memory-system engine

## #13 Memory / knowledge-graph visualizer

- **Inspiration**: memory-system future extension
- **What**: Interactive graph of characters ↔ locations ↔ facts; click to inspect.
- **Fits**: `asset_links` already models these edges polymorphically.
- **Effort**: Med
- **Depends on**: memory/asset graph data

## #14 "World continues without you"

- **Inspiration**: deferred D.5 (cross-chat autonomous messages)
- **What**: A time/turn clock advances world state while the user is away; NPCs act,
  quests progress, consequences await return.
- **Fits**: `world_events` + `quest-engine` (`docs/spec/rpg-mechanics.md`).
- **Effort**: High
- **Depends on**: RPG engine, scheduler/event bus
