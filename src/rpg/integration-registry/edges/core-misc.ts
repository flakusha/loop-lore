/**
 * Integration Registry — core & misc integration edges
 *
 * RPG ↔ Character Core, Weather ↔ Exploration, Magic ↔ Resolution, Blog, and
 * World-Location Traits edges. Migrated verbatim from the former `buildEdges()`.
 */
import type { IntegrationEdge, } from "../types";

/** Remaining cross-system integration edges not owned by a dedicated domain file. */
export const CORE_MISC_EDGES: IntegrationEdge[] = [
  // ── RPG ↔ Character Core ──
  {
    source: "rpg_mechanics",
    target: "character_core",
    direction: "bidirectional",
    interfaces: ["CharacterStats", "PlayerState", "Relationship",],
    events: [
      {
        id: "player.state_changed",
        direction: "emits",
        source: "character_core",
        target: "rpg_mechanics",
        notes: "Player state changes affect mechanics",
      },
      {
        id: "rpg.stat_changed",
        direction: "emits",
        source: "rpg_mechanics",
        target: "character_core",
        notes: "Stat changes affect mood/capability",
      },
    ],
    notes: "G17: RPG owns mechanics stats (STR/DEX/CON/INT/WIS/CHA), Character Core owns personality/mood/identity",
  },

  // ── Weather ↔ Exploration ──
  {
    source: "weather",
    target: "exploration",
    direction: "bidirectional",
    interfaces: ["PlayerState", "WorldLocation",],
    events: [
      {
        id: "weather.changed",
        direction: "emits",
        source: "weather",
        target: "exploration",
        notes: "Weather affects travel speed and hazards",
      },
      {
        id: "exploration.zone_entered",
        direction: "emits",
        source: "exploration",
        target: "weather",
        notes: "Location climate defines base weather",
      },
    ],
  },

  // ── Magic ↔ Resolution ──
  {
    source: "magic",
    target: "resolution",
    direction: "depends_on",
    interfaces: ["DiceRoll",],
    events: [
      {
        id: "resolution.roll",
        direction: "subscribes",
        source: "resolution",
        target: "magic",
        notes: "Spell casting checks, counterspelling",
      },
    ],
  },
  // ── Blog ──
  {
    source: "blog",
    target: "social",
    direction: "depends_on",
    interfaces: ["Notification",],
    events: [
      {
        id: "blog.post_created",
        direction: "emits",
        source: "blog",
        target: "social",
        notes: "New blog post triggers social notifications",
      },
      {
        id: "blog.comment_added",
        direction: "emits",
        source: "blog",
        target: "social",
        notes: "New comment triggers social notifications",
      },
    ],
    notes: "Blog posts and comments feed into social activity stream",
  },
  // ── World-Location Traits ──
  {
    source: "world_location_traits",
    target: "character_core",
    direction: "depends_on",
    interfaces: ["WorldTraitRow", "LocationTraitRow",],
    events: [
      {
        id: "traits.world_trait_changed",
        direction: "emits",
        source: "world_location_traits",
        target: "character_core",
        notes: "World trait change affects character state",
      },
      {
        id: "traits.location_trait_changed",
        direction: "emits",
        source: "world_location_traits",
        target: "character_core",
        notes: "Location trait change affects character state",
      },
    ],
    notes: "World/location traits feed into prompt assembly for character context",
  },
];
