/**
 * Cross-Mechanics Integration Module
 *
 * Typed, queryable integration graph between RPG sub-systems.
 * Replaces the markdown matrix with a runtime-usable data structure
 * that can be queried for dependency resolution, impact analysis,
 * and cross-system event wiring.
 *
 * @module rpg/integration-registry
 */

// ── Core Types ────────────────────────────────────────────────

/** Every RPG sub-system has a stable identifier. */
export type SystemId =
  | "rpg_mechanics"
  | "character_core"
  | "battle"
  | "magic"
  | "crafting"
  | "economy"
  | "social"
  | "crime"
  | "faction"
  | "disease"
  | "companion"
  | "housing"
  | "exploration"
  | "weather"
  | "nsfw"
  | "resolution"
  | "items"
  | "emergent_narrative"
  | "blog"
  | "world_location_traits";

/** Direction of a dependency or integration edge. */
export type EdgeDirection = "depends_on" | "depended_by" | "bidirectional";

/** Severity when an integration edge is missing or broken. */
export type GapSeverity = "high" | "medium" | "low";

export type InterfaceKind =
  | "shared_type" // Both systems use the same TS interface
  | "event" // One system emits, another subscribes
  | "direct_call" // Synchronous function call between systems
  | "db_query" // Both systems read/write the same table
  | "loader_hook" // Loader pipeline (skill/spell affected by items)
  | "config_shared"; // Shared config structure

export type EventDirection = "emits" | "subscribes" | "both";
export type StateLayerClassification = "exclusive" | "stackable";

// ── Integration Edge ──────────────────────────────────────────

/**
 * A single integration edge between two systems.
 * One edge per pair — both directions documented together.
 */
export interface IntegrationEdge {
  /** Source system (the one that "knows about" the other) */
  source: SystemId;

  /** Target system */
  target: SystemId;

  /** Nature of the dependency */
  direction: EdgeDirection;

  /**
   * Contract IDs shared across this edge.
   * Resolve to full InterfaceContract via integration.getContract(id).
   */
  interfaces: string[];

  /** Named cross-system events that bridge the two */
  events: CrossSystemEvent[];

  /** Gap status — is this integration actually implemented yet? */
  gap?: GapStatus;

  /** Free-form notes for implementers */
  notes?: string;
}

// ── Shared Interface Contract ─────────────────────────────────

/**
 * A type, schema, or query pattern shared between two+ systems.
 * This is the "shared data contract" from the integration template.
 */
export interface InterfaceContract {
  id: string; // stable ID, e.g. "StatusEffect"
  kind: InterfaceKind;
  description: string;
  /** File path where the canonical definition lives (once implemented) */
  definitionPath?: string;
  /** Systems that must agree on this shape */
  sharedBy: SystemId[];
}

// ── Cross-System Event ────────────────────────────────────────

/**
 * An event that bridges two systems.
 * Maps to the "Cross-System Events" subsection in each epic.
 */
export interface CrossSystemEvent {
  id: string; // e.g. "weather.changed", "player.state_changed"
  payload?: string; // Description of payload shape
  direction: EventDirection;
  source: SystemId;
  target: SystemId;
  notes?: string;
}

// ── Gap & Audit ───────────────────────────────────────────────

export interface GapStatus {
  /** Unique gap ID (G1–G17 from the audit) */
  gapId: string;
  severity: GapSeverity;
  resolved: boolean;
  /** Where the fix was applied (commit hash or file path) */
  resolvedIn?: string;
}

// ── Player State Layer (wires into player-state-machine.md) ───

export interface PlayerStateLayer {
  id: string; // e.g. "vitality", "consciousness", "physical"
  classification: StateLayerClassification;
  owner: SystemId;
  /** Systems that can cause transitions into this layer */
  producers: SystemId[];
  /** Systems that read this layer to make decisions */
  consumers: SystemId[];
  /** The canonical type name (e.g. "VitalityState", "PhysicalCondition") */
  typeName: string;
}

// ── Integration Registry ──────────────────────────────────────

/**
 * In-memory integration graph. One instance, no DB needed —
 * defined at compile time and statically analyzable.
 *
 * Query methods support:
 *  - "What does Battle depend on?"        → getDependencies("battle")
 *  - "Who depends on Weather?"            → getDependents("weather")
 *  - "Is there a gap between Crime and Social?" → getGap("crime", "social")
 *  - "What events does Disease emit?"      → getEvents("disease", "emits")
 *  - "What shared types does Magic use?"   → getSharedTypes("magic")
 *  - "Show the full graph"                 → getGraph()
 *  - "Which gaps are unresolved?"          → getUnresolvedGaps()
 *  - "Look up a contract by ID"            → getContract("StatusEffect")
 */
class IntegrationRegistry {
  private edges = new Map<string, IntegrationEdge>();
  private contracts = new Map<string, InterfaceContract>();
  private stateLayers: PlayerStateLayer[] = [];

  // ── Registration ──────────────────────────────────────────

  addEdge(edge: IntegrationEdge,): void {
    const key = this.edgeKey(edge.source, edge.target,);
    this.edges.set(key, edge,);
  }

  addContract(contract: InterfaceContract,): void {
    this.contracts.set(contract.id, contract,);
  }

  registerStateLayer(layer: PlayerStateLayer,): void {
    this.stateLayers.push(layer,);
  }

  // ── Queries ───────────────────────────────────────────────

  /** Resolve a contract ID to its full definition. */
  getContract(id: string,): InterfaceContract | undefined {
    return this.contracts.get(id,);
  }

  /** All systems this system depends on. */
  getDependencies(systemId: SystemId,): IntegrationEdge[] {
    return [...this.edges.values(),].filter(
      (e,) =>
        e.source === systemId &&
        (e.direction === "depends_on" || e.direction === "bidirectional"),
    );
  }

  /** All systems that depend on this system. */
  getDependents(systemId: SystemId,): IntegrationEdge[] {
    return [...this.edges.values(),].filter(
      (e,) =>
        e.target === systemId &&
        (e.direction === "depended_by" || e.direction === "bidirectional"),
    );
  }

  /** Full edge for a pair (both directions collapsed into one record). */
  getEdge(source: SystemId, target: SystemId,): IntegrationEdge | undefined {
    return (
      this.edges.get(this.edgeKey(source, target,),) ??
        this.edges.get(this.edgeKey(target, source,),)
    );
  }

  /** Gap status between two systems. */
  getGap(source: SystemId, target: SystemId,): GapStatus | undefined {
    return this.getEdge(source, target,)?.gap;
  }

  /** All unresolved gaps, severity-sorted. */
  getUnresolvedGaps(): IntegrationEdge[] {
    return [...this.edges.values(),]
      .filter((e,) => e.gap && !e.gap.resolved)
      .sort((a, b,) => {
        const order = { high: 0, medium: 1, low: 2, };
        return (order[a.gap!.severity] ?? 3) - (order[b.gap!.severity] ?? 3);
      },);
  }

  /** All events for a system, optionally filtered by direction. */
  getEvents(
    systemId: SystemId,
    direction?: EventDirection,
  ): CrossSystemEvent[] {
    return [...this.edges.values(),]
      .flatMap((e,) => e.events)
      .filter(
        (ev,) =>
          (ev.source === systemId || ev.target === systemId) &&
          (!direction || ev.direction === direction || ev.direction === "both"),
      );
  }

  /** All shared interface contracts for a system. */
  getSharedTypes(systemId: SystemId,): InterfaceContract[] {
    return [...this.contracts.values(),].filter((c,) => c.sharedBy.includes(systemId,));
  }

  /** Full type information for contracts referenced by an edge. */
  resolveEdgeInterfaces(edge: IntegrationEdge,): InterfaceContract[] {
    return edge.interfaces
      .map((id,) => this.contracts.get(id,))
      .filter((c,): c is InterfaceContract => c !== undefined);
  }

  /** Player state layers owned by a system. */
  getStateLayers(systemId: SystemId,): PlayerStateLayer[] {
    return this.stateLayers.filter((l,) => l.owner === systemId);
  }

  /** Full adjacency list for Mermaid/graph rendering. */
  getGraph(): Map<SystemId, SystemId[]> {
    const adj = new Map<SystemId, SystemId[]>();
    for (const edge of this.edges.values()) {
      if (!adj.has(edge.source,)) { adj.set(edge.source, [],); }
      if (!adj.has(edge.target,)) { adj.set(edge.target, [],); }
      adj.get(edge.source,)!.push(edge.target,);
      if (edge.direction === "bidirectional") {
        adj.get(edge.target,)!.push(edge.source,);
      }
    }
    return adj;
  }

  // ── Internal ──────────────────────────────────────────────

  private edgeKey(a: SystemId, b: SystemId,): string {
    return `${a}→${b}`;
  }
}

// ── Singleton export ──────────────────────────────────────────

export const integration = new IntegrationRegistry();

// ── Populate: Shared Data Contracts ───────────────────────────

const SHARED_CONTRACTS: InterfaceContract[] = [
  {
    id: "StatusEffect",
    kind: "shared_type",
    description: "Unified buff/debuff model used by Battle, Magic, Disease, Social, NSFW",
    sharedBy: ["battle", "magic", "disease", "social", "nsfw",],
  },
  {
    id: "DiceRoll",
    kind: "shared_type",
    description: "Unified dice resolution for all skill checks",
    sharedBy: [
      "rpg_mechanics",
      "battle",
      "social",
      "crime",
      "exploration",
      "magic",
    ],
  },
  {
    id: "CharacterStats",
    kind: "shared_type",
    description: "STR/DEX/CON/INT/WIS/CHA — mechanics stats owned by RPG, used everywhere",
    sharedBy: [
      "rpg_mechanics",
      "battle",
      "magic",
      "social",
      "crafting",
      "crime",
    ],
  },
  {
    id: "ReputationScore",
    kind: "shared_type",
    description: "Unified reputation model (faction standing + social reputation). MUST be one type, not two.",
    sharedBy: ["faction", "social", "crime",],
  },
  {
    id: "PlayerState",
    kind: "shared_type",
    description: "8-layer composite player state (see player-state-machine.md)",
    sharedBy: [
      "rpg_mechanics",
      "battle",
      "magic",
      "social",
      "crime",
      "disease",
      "weather",
      "nsfw",
      "exploration",
      "companion",
      "character_core",
      "resolution",
    ],
  },
  {
    id: "Item",
    kind: "shared_type",
    description: "Crafted items, loot, equipment — shared across crafting, inventory, economy, housing",
    sharedBy: ["items", "battle", "crafting", "economy", "housing",],
  },
  {
    id: "CraftingStation",
    kind: "shared_type",
    description: "Home crafting stations use same station model as world stations",
    sharedBy: ["crafting", "housing",],
  },
  {
    id: "Recipe",
    kind: "shared_type",
    description: "Recipe definitions shared between crafting, enchanting, and furniture crafting",
    sharedBy: ["crafting", "magic", "housing",],
  },
  {
    id: "StorageContainer",
    kind: "shared_type",
    description: "Housing storage extends inventory system",
    sharedBy: ["housing", "items",],
  },
  {
    id: "WorldLocation",
    kind: "shared_type",
    description: "Housing placement uses shared location model",
    sharedBy: ["housing", "exploration", "economy",],
  },
  {
    id: "Relationship",
    kind: "shared_type",
    description: "Character/AI relationship state — shared between character core, social, companion, NSFW",
    sharedBy: ["character_core", "social", "companion", "nsfw",],
  },
];

// ── Populate: Integration Edges ───────────────────────────────

function buildEdges(): IntegrationEdge[] {
  return [
    // ── Battle ──
    {
      source: "battle",
      target: "items",
      direction: "depends_on",
      interfaces: ["Item", "StatusEffect",],
      events: [
        {
          id: "battle.loot_dropped",
          direction: "emits",
          source: "battle",
          target: "items",
          notes: "Loot drops feed inventory",
        },
        {
          id: "battle.item_used",
          direction: "emits",
          source: "battle",
          target: "items",
          notes: "Consumable consumed in combat",
        },
      ],
    },
    {
      source: "battle",
      target: "social",
      direction: "depends_on",
      interfaces: ["CharacterStats", "StatusEffect",],
      events: [
        {
          id: "battle.intimidate_check",
          direction: "subscribes",
          source: "social",
          target: "battle",
          notes: "Social skill during combat",
        },
        {
          id: "battle.surrender",
          direction: "emits",
          source: "battle",
          target: "social",
          notes: "Surrender resolves combat via social",
        },
      ],
    },
    {
      source: "battle",
      target: "weather",
      direction: "depends_on",
      interfaces: ["PlayerState",],
      events: [
        {
          id: "weather.changed",
          direction: "subscribes",
          source: "weather",
          target: "battle",
          notes: "Environmental modifiers applied",
        },
      ],
    },
    {
      source: "battle",
      target: "companion",
      direction: "depended_by",
      interfaces: ["PlayerState", "CharacterStats",],
      events: [
        {
          id: "battle.companion_turn",
          direction: "subscribes",
          source: "companion",
          target: "battle",
          notes: "Companion participates in turn order",
        },
        {
          id: "companion.fainted",
          direction: "emits",
          source: "companion",
          target: "battle",
          notes: "Companion removed from combat",
        },
      ],
    },
    {
      source: "battle",
      target: "resolution",
      direction: "depends_on",
      interfaces: ["DiceRoll",],
      events: [
        {
          id: "resolution.roll",
          direction: "subscribes",
          source: "resolution",
          target: "battle",
          notes: "Attack rolls, saving throws",
        },
      ],
    },

    // ── Crime ──
    {
      source: "crime",
      target: "economy",
      direction: "bidirectional",
      interfaces: ["Item",],
      events: [
        {
          id: "crime.black_market_open",
          direction: "emits",
          source: "crime",
          target: "economy",
          notes: "Black market pricing uses economy mechanics",
        },
        {
          id: "economy.stolen_goods_listed",
          direction: "emits",
          source: "economy",
          target: "crime",
          notes: "Stolen items enter economy as trade goods",
        },
      ],
    },
    {
      source: "crime",
      target: "social",
      direction: "bidirectional",
      interfaces: ["ReputationScore",],
      events: [
        {
          id: "crime.reputation_changed",
          direction: "emits",
          source: "crime",
          target: "social",
          notes: "Criminal reputation affects social standing",
        },
        {
          id: "social.deception_check",
          direction: "subscribes",
          source: "social",
          target: "crime",
          notes: "Social skills aid crime (disguise, deception)",
        },
      ],
    },

    // ── Faction ──
    {
      source: "faction",
      target: "social",
      direction: "bidirectional",
      interfaces: ["ReputationScore",],
      events: [
        {
          id: "faction.standing_changed",
          direction: "emits",
          source: "faction",
          target: "social",
          notes: "Faction standing affects social interactions",
        },
        {
          id: "social.reputation_updated",
          direction: "emits",
          source: "social",
          target: "faction",
          notes: "Social reputation affects faction relationships",
        },
        {
          id: "poll.resolved",
          direction: "emits",
          source: "social",
          target: "faction",
          notes: "Faction leadership/election polls drive faction state changes",
        },
      ],
      notes:
        "G14: Shared ReputationScore type MUST be defined once, used by both systems. Polls can drive faction decisions.",
    },

    // ── Disease ──
    {
      source: "disease",
      target: "weather",
      direction: "depends_on",
      interfaces: ["PlayerState",],
      events: [
        {
          id: "weather.changed",
          direction: "subscribes",
          source: "weather",
          target: "disease",
          notes: "Rain spreads waterborne disease; cold weakens immunity",
        },
        {
          id: "disease.plague_zone",
          direction: "emits",
          source: "disease",
          target: "weather",
          notes: "Active plague affects weather (pestilence fog)",
        },
      ],
    },
    {
      source: "disease",
      target: "nsfw",
      direction: "depended_by",
      interfaces: ["StatusEffect", "PlayerState",],
      events: [
        {
          id: "disease.reproductive_health",
          direction: "subscribes",
          source: "nsfw",
          target: "disease",
          notes: "STDs, pregnancy complications",
        },
        {
          id: "nsfw.encounter_completed",
          direction: "subscribes",
          source: "nsfw",
          target: "disease",
          notes: "Triggers health check after intimate encounter",
        },
      ],
    },

    // ── NSFW ──
    {
      source: "nsfw",
      target: "housing",
      direction: "depends_on",
      interfaces: ["PlayerState",],
      events: [
        {
          id: "housing.nsfw_encounter",
          direction: "subscribes",
          source: "housing",
          target: "nsfw",
          notes: "Housing provides private spaces with comfort bonuses",
        },
      ],
    },
    {
      source: "nsfw",
      target: "weather",
      direction: "depends_on",
      interfaces: ["PlayerState",],
      events: [
        {
          id: "weather.changed",
          direction: "subscribes",
          source: "weather",
          target: "nsfw",
          notes: "Weather affects encounter mood and location availability",
        },
      ],
    },
    {
      source: "nsfw",
      target: "social",
      direction: "depends_on",
      interfaces: ["ReputationScore", "Relationship",],
      events: [
        {
          id: "nsfw.reputation_changed",
          direction: "emits",
          source: "nsfw",
          target: "social",
          notes: "NSFW reputation feeds social standing",
        },
      ],
    },

    // ── Housing ──
    {
      source: "housing",
      target: "crafting",
      direction: "depends_on",
      interfaces: ["CraftingStation", "Recipe",],
      events: [
        {
          id: "housing.crafted",
          direction: "emits",
          source: "housing",
          target: "crafting",
          notes: "Crafting in home stations",
        },
      ],
    },
    {
      source: "housing",
      target: "crime",
      direction: "depended_by",
      interfaces: ["PlayerState",],
      events: [
        {
          id: "housing.burglary",
          direction: "subscribes",
          source: "crime",
          target: "housing",
          notes: "Crime targets housing security",
        },
      ],
    },
    {
      source: "housing",
      target: "companion",
      direction: "depended_by",
      interfaces: ["PlayerState",],
      events: [
        {
          id: "companion.housed",
          direction: "subscribes",
          source: "companion",
          target: "housing",
          notes: "Companion housing assigns stable/room",
        },
      ],
    },

    // ── Social (Polls) ──
    {
      source: "social",
      target: "housing",
      direction: "depends_on",
      interfaces: ["Relationship",],
      events: [
        {
          id: "poll.resolved",
          direction: "emits",
          source: "social",
          target: "housing",
          notes: "Decoration contest voting drives housing contest results",
        },
      ],
    },

    // ── Crafting ──
    {
      source: "crafting",
      target: "magic",
      direction: "bidirectional",
      interfaces: ["Recipe", "Item",],
      events: [
        {
          id: "magic.enchantment_applied",
          direction: "subscribes",
          source: "magic",
          target: "crafting",
          notes: "Enchanting as cross-system feature",
        },
        {
          id: "crafting.item_crafted",
          direction: "emits",
          source: "crafting",
          target: "magic",
          notes: "Crafted item can receive enchantment",
        },
      ],
    },

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
      interfaces: ["Notification"],
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
      interfaces: ["WorldTraitRow", "LocationTraitRow"],
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
    }
  ];
}

// ── Populate: Player State Layers ─────────────────────────────

const PLAYER_STATE_LAYERS: PlayerStateLayer[] = [
  {
    id: "vitality",
    classification: "exclusive",
    owner: "rpg_mechanics",
    producers: ["battle", "disease", "magic",],
    consumers: [
      "battle",
      "social",
      "crime",
      "companion",
      "housing",
      "exploration",
      "disease",
      "nsfw",
      "magic",
    ],
    typeName: "VitalityState",
  },
  {
    id: "consciousness",
    classification: "exclusive",
    owner: "resolution",
    producers: ["battle", "disease", "magic",],
    consumers: ["battle", "social", "nsfw", "exploration", "crime",],
    typeName: "ConsciousnessState",
  },
  {
    id: "combat",
    classification: "exclusive",
    owner: "battle",
    producers: ["battle", "disease", "magic",],
    consumers: ["battle", "companion", "crime", "social",],
    typeName: "CombatState",
  },
  {
    id: "social",
    classification: "stackable",
    owner: "social",
    producers: ["social", "crime", "faction",],
    consumers: [
      "social",
      "crime",
      "faction",
      "economy",
      "housing",
      "companion",
    ],
    typeName: "SocialState",
  },
  {
    id: "mental",
    classification: "exclusive",
    owner: "character_core",
    producers: ["magic", "social", "nsfw", "disease",],
    consumers: ["battle", "social", "crime", "companion", "exploration",],
    typeName: "MentalState",
  },
  {
    id: "physical",
    classification: "stackable",
    owner: "disease",
    producers: ["disease", "magic", "crafting", "crime", "weather",],
    consumers: ["battle", "exploration", "nsfw", "social",],
    typeName: "PhysicalState",
  },
  {
    id: "environmental",
    classification: "stackable",
    owner: "weather",
    producers: ["weather", "exploration",],
    consumers: [
      "battle",
      "disease",
      "nsfw",
      "crafting",
      "housing",
      "exploration",
    ],
    typeName: "EnvironmentalState",
  },
  {
    id: "nsfw_intimate",
    classification: "exclusive",
    owner: "nsfw",
    producers: ["nsfw", "social", "weather",],
    consumers: ["nsfw", "social", "disease", "character_core", "housing",],
    typeName: "NsfwState",
  },
];

// ── Bootstrap ─────────────────────────────────────────────────

for (const contract of SHARED_CONTRACTS) {
  integration.addContract(contract,);
}

for (const edge of buildEdges()) {
  integration.addEdge(edge,);
}

for (const layer of PLAYER_STATE_LAYERS) {
  integration.registerStateLayer(layer,);
}

// ── Mermaid renderer (optional, for docs) ─────────────────────

/**
 * Runtime Mermaid graph export. Call to generate a diagram.
 * Use in docs gen, CI, or admin dashboard.
 */
export function renderIntegrationMermaid(): string {
  const owners = [...new Set(PLAYER_STATE_LAYERS.map((l,) => l.owner),),];

  const ownerEdges = PLAYER_STATE_LAYERS.map(
    (l,) => `'${l.owner}' -->|'${l.id} layer (${l.classification})'|('${l.id}'),`,
  ).join("\n",);

  const producerEdges = PLAYER_STATE_LAYERS.flatMap((l,) =>
    l.producers
      .filter((p,) => p !== l.owner)
      .map((p,) => `'${p}' -.->|'produces ${l.id}'|('${l.id}'),`)
  ).join("\n",);

  return `flowchart LR\n${owners.map((o,) => `'${o}',`).join("\n",)}\n${ownerEdges}\n${producerEdges}`;
}
