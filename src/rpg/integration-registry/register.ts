// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration Registry — registration dispatchers
 *
 * Standalone `thisL`-threaded versions of the former class registration
 * methods (`addEdge`, `addContract`, `registerStateLayer`), reassembled by the
 * `IntegrationRegistry` factory in `index.ts`. Bodies migrated verbatim.
 */
import { edgeKey, } from "./edge-key";
import type {
  IntegrationEdge,
  IntegrationRegistryContext,
  InterfaceContract,
  PlayerStateLayer,
} from "./types";

export interface AddEdgeArgs {
  thisL: IntegrationRegistryContext;
  edge: IntegrationEdge;
}

/** Register a single integration edge. */
export function addEdge({ thisL, edge, }: AddEdgeArgs,): void {
  const key = edgeKey(edge.source, edge.target,);
  thisL.edges.set(key, edge,);
}

export interface AddContractArgs {
  thisL: IntegrationRegistryContext;
  contract: InterfaceContract;
}

/** Register a single shared interface contract, keyed by its stable id. */
export function addContract({ thisL, contract, }: AddContractArgs,): void {
  thisL.contracts.set(contract.id, contract,);
}

export interface RegisterStateLayerArgs {
  thisL: IntegrationRegistryContext;
  layer: PlayerStateLayer;
}

/** Append a player state layer to the registry. */
export function registerStateLayer({ thisL, layer, }: RegisterStateLayerArgs,): void {
  thisL.stateLayers.push(layer,);
}
