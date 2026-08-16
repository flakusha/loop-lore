// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-Mechanics Integration Module — types
 *
 * Core graph data types (system ids, edges, contracts, events, gaps, player
 * state layers) plus the `IntegrationRegistry` public API interface (single
 * source of truth for the API shape) and the dispatcher `thisL` context.
 */

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
export const EdgeDirection = {
  DependsOn: "depends_on",
  DependedBy: "depended_by",
  Bidirectional: "bidirectional",
} as const;
export type EdgeDirection = (typeof EdgeDirection)[keyof typeof EdgeDirection];

/** Severity when an integration edge is missing or broken. */
export type GapSeverity = "high" | "medium" | "low";

export type InterfaceKind =
  | "shared_type" // Both systems use the same TS interface
  | "event" // One system emits, another subscribes
  | "direct_call" // Synchronous function call between systems
  | "db_query" // Both systems read/write the same table
  | "loader_hook" // Loader pipeline (skill/spell affected by items)
  | "config_shared"; // Shared config structure

export const EventDirection = {
  Emits: "emits",
  Subscribes: "subscribes",
  Both: "both",
} as const;
export type EventDirection = (typeof EventDirection)[keyof typeof EventDirection];
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
export interface IntegrationRegistry {
  addEdge(edge: IntegrationEdge,): void;
  addContract(contract: InterfaceContract,): void;
  registerStateLayer(layer: PlayerStateLayer,): void;

  /** Resolve a contract ID to its full definition. */
  getContract(id: string,): InterfaceContract | undefined;
  /** All systems this system depends on. */
  getDependencies(systemId: SystemId,): IntegrationEdge[];
  /** All systems that depend on this system. */
  getDependents(systemId: SystemId,): IntegrationEdge[];
  /** Full edge for a pair (both directions collapsed into one record). */
  getEdge(source: SystemId, target: SystemId,): IntegrationEdge | undefined;
  /** Gap status between two systems. */
  getGap(source: SystemId, target: SystemId,): GapStatus | undefined;
  /** All unresolved gaps, severity-sorted. */
  getUnresolvedGaps(): IntegrationEdge[];
  /** All events for a system, optionally filtered by direction. */
  getEvents(systemId: SystemId, direction?: EventDirection,): CrossSystemEvent[];
  /** All shared interface contracts for a system. */
  getSharedTypes(systemId: SystemId,): InterfaceContract[];
  /** Full type information for contracts referenced by an edge. */
  resolveEdgeInterfaces(edge: IntegrationEdge,): InterfaceContract[];
  /** Player state layers owned by a system. */
  getStateLayers(systemId: SystemId,): PlayerStateLayer[];
  /** Full adjacency list for Mermaid/graph rendering. */
  getGraph(): Map<SystemId, SystemId[]>;
}

/** Private, in-memory state the registry factory owns (exposed to dispatchers as `thisL`). */
export interface RegistryState {
  edges: Map<string, IntegrationEdge>;
  contracts: Map<string, InterfaceContract>;
  stateLayers: PlayerStateLayer[];
}

/**
 * The full registry instance passed to dispatchers as `thisL`.
 * The public API plus the private maps so any dispatcher can read/mutate state.
 */
export type IntegrationRegistryContext = IntegrationRegistry & RegistryState;
