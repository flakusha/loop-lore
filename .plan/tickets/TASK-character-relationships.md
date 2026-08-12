# TASK-2026-050: Character Relationships Graph

**Status**: open
**Priority**: medium
**Labels**: feature, characters, relationships
**Assignee**:
**Epic**: EPIC-059 (Creative Studio)

## Description

Character relationships as a graph system. Supports NPC-to-NPC and character-to-character relationships with strength, opinion, and status.

### Relationships Reference

**Relationship Structure**

```toml
[[permanent.relationships]]
target_id = "npc_002"
target_name = "Captain Vane"
type = "professional"
sub_type = "superior"
flow = "directional" # "directional" or "mutual"
strength = 0.85 # 0.0 (estranged) to 1.0 (bonded)
opinion = 75 # -100 (hatred) to 100 (adoration)
status = "active" # "active", "past", "secret"
tags = ["owes_favor", "knows_secret"]
```

**Quest Generation Hooks**

```toml
[permanent.quest_generation]
motivations = { security = 8, pleasure = 3, greed = 6, knowledge = 9, revenge = 2 }
observers = [
  { id = "field_security", type = "count", target = "hostiles", threshold = 0 },
]
quest_assets = [
  { id = "wolf_spawner", motivation_match = "security", difficulty = 5 },
]
```

### Acceptance Criteria

- [ ] Add `character_relationships` DB table
- [ ] Relationship graph queries (by target, by strength, by type)
- [ ] Integrate with mood system (relationship affects behavior)
- [ ] Quest generation hooks based on relationships

### Notes

Relationships affect:

- Dialogue options
- Quest availability
- Combat behavior
- Trade prices
- Information sharing

Graph-based queries needed for:

- "Who does this NPC trust?"
- "What are the strongest bonds in this chat?"
- "Which characters have secret relationships?"
