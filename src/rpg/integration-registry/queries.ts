/**
 * Integration Registry — query dispatchers
 *
 * Standalone `thisL`-threaded versions of the former class query methods
 * (`getContract`, `getDependencies`, `getDependents`, `getEdge`, `getGap`,
 * `getUnresolvedGaps`, `getEvents`, `getSharedTypes`, `resolveEdgeInterfaces`,
 * `getStateLayers`, `getGraph`), reassembled by the `IntegrationRegistry`
 * factory in `index.ts`. Bodies migrated verbatim.
 */
import { edgeKey, } from "./edge-key";
import {
  type CrossSystemEvent,
  EdgeDirection,
  EventDirection,
  type GapStatus,
  type IntegrationEdge,
  type IntegrationRegistryContext,
  type InterfaceContract,
  type PlayerStateLayer,
  type SystemId,
} from "./types";

export interface GetContractArgs {
  thisL: IntegrationRegistryContext;
  id: string;
}

/** Resolve a contract ID to its full definition. */
export function getContract({ thisL, id, }: GetContractArgs,): InterfaceContract | undefined {
  return thisL.contracts.get(id,);
}

export interface GetDependenciesArgs {
  thisL: IntegrationRegistryContext;
  systemId: SystemId;
}

/** All systems this system depends on. */
export function getDependencies({ thisL, systemId, }: GetDependenciesArgs,): IntegrationEdge[] {
  const out: IntegrationEdge[] = [];
  for (const e of thisL.edges.values()) {
    if (
      e.source === systemId && (e.direction === EdgeDirection.DependsOn || e.direction === EdgeDirection.Bidirectional)
    ) {
      out.push(e,);
    }
  }
  return out;
}

export interface GetDependentsArgs {
  thisL: IntegrationRegistryContext;
  systemId: SystemId;
}

/** All systems that depend on this system. */
export function getDependents({ thisL, systemId, }: GetDependentsArgs,): IntegrationEdge[] {
  const out: IntegrationEdge[] = [];
  for (const e of thisL.edges.values()) {
    if (
      e.target === systemId && (e.direction === EdgeDirection.DependedBy || e.direction === EdgeDirection.Bidirectional)
    ) {
      out.push(e,);
    }
  }
  return out;
}

export interface GetEdgeArgs {
  thisL: IntegrationRegistryContext;
  source: SystemId;
  target: SystemId;
}

/** Full edge for a pair (both directions collapsed into one record). */
export function getEdge({ thisL, source, target, }: GetEdgeArgs,): IntegrationEdge | undefined {
  return (
    thisL.edges.get(edgeKey(source, target,),) ??
      thisL.edges.get(edgeKey(target, source,),)
  );
}

export interface GetGapArgs {
  thisL: IntegrationRegistryContext;
  source: SystemId;
  target: SystemId;
}

/** Gap status between two systems. */
export function getGap({ thisL, source, target, }: GetGapArgs,): GapStatus | undefined {
  return getEdge({ thisL, source, target, },)?.gap;
}

export interface GetUnresolvedGapsArgs {
  thisL: IntegrationRegistryContext;
}

/** All unresolved gaps, severity-sorted. */
export function getUnresolvedGaps({ thisL, }: GetUnresolvedGapsArgs,): IntegrationEdge[] {
  const out: IntegrationEdge[] = [];
  for (const e of thisL.edges.values()) {
    if (e.gap && !e.gap.resolved) { out.push(e,); }
  }
  return out.sort((a, b,) => {
    const order = { high: 0, medium: 1, low: 2, };
    return (order[a.gap!.severity] ?? 3) - (order[b.gap!.severity] ?? 3);
  },);
}

export interface GetEventsArgs {
  thisL: IntegrationRegistryContext;
  systemId: SystemId;
  direction?: EventDirection;
}

/** All events for a system, optionally filtered by direction. */
export function getEvents(
  { thisL, systemId, direction, }: GetEventsArgs,
): CrossSystemEvent[] {
  const out: CrossSystemEvent[] = [];
  for (const e of thisL.edges.values()) {
    for (const ev of e.events) {
      if (
        (ev.source === systemId || ev.target === systemId) &&
        (!direction || ev.direction === direction || ev.direction === EventDirection.Both)
      ) {
        out.push(ev,);
      }
    }
  }
  return out;
}

export interface GetSharedTypesArgs {
  thisL: IntegrationRegistryContext;
  systemId: SystemId;
}

/** All shared interface contracts for a system. */
export function getSharedTypes({ thisL, systemId, }: GetSharedTypesArgs,): InterfaceContract[] {
  const out: InterfaceContract[] = [];
  for (const c of thisL.contracts.values()) {
    if (c.sharedBy.includes(systemId,)) { out.push(c,); }
  }
  return out;
}

export interface ResolveEdgeInterfacesArgs {
  thisL: IntegrationRegistryContext;
  edge: IntegrationEdge;
}

/** Full type information for contracts referenced by an edge. */
export function resolveEdgeInterfaces({ thisL, edge, }: ResolveEdgeInterfacesArgs,): InterfaceContract[] {
  const out: InterfaceContract[] = [];
  for (const id of edge.interfaces) {
    const c = thisL.contracts.get(id,);
    if (c !== undefined) { out.push(c,); }
  }
  return out;
}

export interface GetStateLayersArgs {
  thisL: IntegrationRegistryContext;
  systemId: SystemId;
}

/** Player state layers owned by a system. */
export function getStateLayers({ thisL, systemId, }: GetStateLayersArgs,): PlayerStateLayer[] {
  const out: PlayerStateLayer[] = [];
  for (const l of thisL.stateLayers) {
    if (l.owner === systemId) { out.push(l,); }
  }
  return out;
}

export interface GetGraphArgs {
  thisL: IntegrationRegistryContext;
}

/** Full adjacency list for Mermaid/graph rendering. */
export function getGraph({ thisL, }: GetGraphArgs,): Map<SystemId, SystemId[]> {
  const adj = new Map<SystemId, SystemId[]>();
  for (const edge of thisL.edges.values()) {
    if (!adj.has(edge.source,)) { adj.set(edge.source, [],); }
    if (!adj.has(edge.target,)) { adj.set(edge.target, [],); }
    adj.get(edge.source,)!.push(edge.target,);
    if (edge.direction === EdgeDirection.Bidirectional) {
      adj.get(edge.target,)!.push(edge.source,);
    }
  }
  return adj;
}
