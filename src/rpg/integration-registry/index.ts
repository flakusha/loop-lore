// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-Mechanics Integration Module
 *
 * Typed, queryable integration graph between RPG sub-systems.
 * Replaces the markdown matrix with a runtime-usable data structure
 * that can be queried for dependency resolution, impact analysis,
 * and cross-system event wiring.
 *
 * Splits the former `IntegrationRegistry` class into standalone dispatcher
 * functions (registration/queries) threaded with an explicit `thisL` context,
 * reassembled here by a factory. `IntegrationRegistry` is a single source of
 * truth: the interface IS the API type and the factory value shares the same
 * exported name (TS declaration merge), so there is no parallel interface.
 *
 * Public surface is identical to the former `src/rpg/integration-registry.ts`:
 *  - the data types and interfaces
 *  - the `IntegrationRegistry` type/factory
 *  - the `integration` singleton (populated at module load)
 *  - `renderIntegrationMermaid`
 */
import { SHARED_CONTRACTS, } from "./contracts";
import { buildEdges, } from "./edges";
import { PLAYER_STATE_LAYERS, } from "./player-state-layers";
import {
  getContract,
  getDependencies,
  getDependents,
  getEdge,
  getEvents,
  getGap,
  getGraph,
  getSharedTypes,
  getStateLayers,
  getUnresolvedGaps,
  resolveEdgeInterfaces,
} from "./queries";
import {
  addContract,
  addEdge,
  registerStateLayer,
} from "./register";
import type {
  IntegrationRegistry as IntegrationRegistryIface,
  IntegrationRegistryContext,
  RegistryState,
} from "./types";

export type {
  CrossSystemEvent,
  EdgeDirection,
  EventDirection,
  GapSeverity,
  GapStatus,
  IntegrationEdge,
  InterfaceContract,
  InterfaceKind,
  PlayerStateLayer,
  StateLayerClassification,
  SystemId,
} from "./types";

export { renderIntegrationMermaid, } from "./mermaid";

/** Public API type — merged with the factory value below. */
// The empty interface is intentional: it merges the `IntegrationRegistry`
// factory value with a same-named type so one name is both the API type and
// the factory.

export interface IntegrationRegistry extends IntegrationRegistryIface {}

/**
 * Create an IntegrationRegistry instance.
 * @returns A fresh, empty integration graph (matches the former
 *          `new IntegrationRegistry()`).
 */
export function IntegrationRegistry(): IntegrationRegistry {
  const state: RegistryState = {
    edges: new Map(),
    contracts: new Map(),
    stateLayers: [],
  };
  const self: IntegrationRegistryContext = {
    ...state,
    addEdge: (edge,) => addEdge({ thisL: self, edge, },),
    addContract: (contract,) => addContract({ thisL: self, contract, },),
    registerStateLayer: (layer,) => registerStateLayer({ thisL: self, layer, },),
    getContract: (id,) => getContract({ thisL: self, id, },),
    getDependencies: (systemId,) => getDependencies({ thisL: self, systemId, },),
    getDependents: (systemId,) => getDependents({ thisL: self, systemId, },),
    getEdge: (source, target,) => getEdge({ thisL: self, source, target, },),
    getGap: (source, target,) => getGap({ thisL: self, source, target, },),
    getUnresolvedGaps: () => getUnresolvedGaps({ thisL: self, },),
    getEvents: (systemId, direction,) => getEvents({ thisL: self, systemId, direction, },),
    getSharedTypes: (systemId,) => getSharedTypes({ thisL: self, systemId, },),
    resolveEdgeInterfaces: (edge,) => resolveEdgeInterfaces({ thisL: self, edge, },),
    getStateLayers: (systemId,) => getStateLayers({ thisL: self, systemId, },),
    getGraph: () => getGraph({ thisL: self, },),
  };
  return self;
}

// ── Singleton export ──────────────────────────────────────────

export const integration = IntegrationRegistry();

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
