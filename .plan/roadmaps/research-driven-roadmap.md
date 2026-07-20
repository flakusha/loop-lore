# Research-Driven Roadmap (RPG / Text-RPG Prior Art)

> Derived from `.plan/research/rpg-landscape.md` (historical survey + non-AI mechanics).
> Maps research insights → planning artifacts with priorities. Companion to
> `rpg-implementation-roadmap.md`.

## Priority legend

- **P0** — blocking / must decide before building dependent systems
- **P1** — high-value new capability, schedule next
- **P2** — enrichment / tracking, opportunistic

## P0 — Foundational decisions (do first)

| Item                         | Artifact                                                           | Why                                                                      |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Resolution family decision   | TASK-resolution-family-decision → epic-resolution-system           | Blocks battle-mode + rpg-mechanics resolution work                       |
| Moderation design principles | TASK-ai-dungeon-moderation-lesson → epic-chat-lifecycle-moderation | Privacy-first stance must be set before launch; AI Dungeon 2021 backlash |
| Persistence model            | epic-multi-session (existing) + research §4.3/§7.2                 | MUD1 persistence is the substrate for everything                         |

## P1 — High-value new epics (schedule next)

| Item                                          | Artifact                                               | Value                                                       |
| --------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Factions, reputation, persistent consequences | epic-faction-reputation + TASK-faction-standing-schema | Social layer that predates engines; Undertale-style meaning |
| Player agency (story points)                  | epic-agency-story-points + TASK-story-points-prototype | Chat-RPG agency without over-determining LLM                |
| Emergent narrative design lens                | epic-emergent-narrative-design                         | Cross-cutting principle guarding mode-switch design         |
| Resolution implementation                     | epic-resolution-system (after decision)                | Concrete ruleset for dice/combat                            |

## P2 — Enrichment & tracking (opportunistic)

| Item                                | Artifact                                                    | Value                                       |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| Inspiration watch (Voyage)          | TASK-track-voyage-inspiration → epic-platform-research      | Inspiration signal                          |
| Enrich existing epics via cross-ref | rpg-landscape.md §11                                        | Discoverability for 20+ epics               |
| Crafting/economy scaffolding        | epic-crafting-professions + epic-economy-trading (existing) | Research §6.5 → reputation-gated blueprints |
| Local-first ownership principle     | AGENTS / architecture                                       | SillyTavern stance loop-lore inherits       |

## Suggested sequence

1. **Now:** resolve P0 decisions (resolution family, moderation principles).
2. **Next milestone:** ship faction-standing schema + story-points prototype (P1) —
   these are the two most novel, research-unique contributions.
3. **Then:** implement resolution family; apply emergent-narrative lens to mode-switch
   work; track Voyage.

## Open questions carried from research (§10)

- Social-RP vs adventure as primary mode?
- Roguelike mechanics: optional mode switch or core?
- Single unified resolution system or dual-mode?
- Story points: introduce yes/no?
- Crafting scope: full auction house vs lightweight scarcity?
