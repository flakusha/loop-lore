/**
 * Integration Registry — core & misc integration edges
 *
 * RPG ↔ Character Core, Weather ↔ Exploration, Magic ↔ Resolution, Blog, and
 * World-Location Traits edges. Migrated verbatim from the former `buildEdges()`.
 */
import { type IntegrationEdge, EdgeDirection, EventDirection, } from "../types";

/** Remaining cross-system integration edges not owned by a dedicated domain file. */
export const CORE_MISC_EDGES: IntegrationEdge[] = [
  // ── RPG ↔ Character Core ──
  {
    source: "rpg_mechanics",
    target: "character_core",
    direction: EdgeDirection.Bidirectional,
    interfaces: ["CharacterStats", "PlayerState", "Relationship",],
    events: [
      {
        id: "player.state_changed",
        direction: EventDirection.Emits,
        source: "character_core",
        target: "rpg_mechanics",
        notes: "Player state changes affect mechanics",
      },
      {
        id: "rpg.stat_changed",
        direction: EventDirection.Emits,
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
    direction: EdgeDirection.Bidirectional,
    interfaces: ["PlayerState", "WorldLocation",],
    events: [
      {
        id: "weather.changed",
        direction: EventDirection.Emits,
        source: "weather",
        target: "exploration",
        notes: "Weather affects travel speed and hazards",
      },
      {
        id: "exploration.zone_entered",
        direction: EventDirection.Emits,
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
    direction: EdgeDirection.DependsOn,
    interfaces: ["DiceRoll",],
    events: [
      {
        id: "resolution.roll",
        direction: EventDirection.Subscribes,
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
    direction: EdgeDirection.DependsOn,
    interfaces: ["Notification",],
    events: [
      {
        id: "blog.post_created",
        direction: EventDirection.Emits,
        source: "blog",
        target: "social",
        notes: "New blog post triggers social notifications",
      },
      {
        id: "blog.comment_added",
        direction: EventDirection.Emits,
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
    direction: EdgeDirection.DependsOn,
    interfaces: ["WorldTraitRow", "LocationTraitRow",],
    events: [
      {
        id: "traits.world_trait_changed",
        direction: EventDirection.Emits,
        source: "world_location_traits",
        target: "character_core",
        notes: "World trait change affects character state",
      },
      {
        id: "traits.location_trait_changed",
        direction: EventDirection.Emits,
        source: "world_location_traits",
        target: "character_core",
        notes: "Location trait change affects character state",
      },
    ],
    notes: "World/location traits feed into prompt assembly for character context",
  },
];
