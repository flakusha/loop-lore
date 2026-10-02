// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/world-travel/walk.ts — the pure movement rule
 *
 * Split from `travel.ts` so the walk itself (a function of a party, a route,
 * and a claim set — nothing else) can be read and tested without the
 * persistence and budget machinery around it. The collision rule's meaning
 * lives here; the DB writes that enforce it live in `travel.ts`.
 */

/** Party row as the walk needs it. */
export interface PartyRow {
  id: string;
  route: string;
  route_index: number;
  steps_per_tick: number;
  travel_progress: number;
  blocked_until_tick: number;
}

/** Result of walking one party forward. */
export interface Walk {
  /** Route edges actually traversed. */
  edges: number;
  /** Route index to persist. */
  routeIndex: number;
  /** Fractional-edge carry to persist. */
  progress: number;
  /** Location the party ended on. */
  locationId: string;
  /** True when the walk reached the end of the route. */
  settled: boolean;
}

/**
 * Walk one party forward across `route`.
 *
 * Each edge crossing claims its destination. A destination that is
 * already claimed ends the walk where it is: the party holds the edge it
 * did reach, so next tick starts from a location it actually occupies.
 * The party's speed for this tick is folded into the carry first, so a
 * fractional speed accumulates and a speed above 1 walks several edges.
 * @param party the party row, read before this tick
 * @param route ordered location ids
 * @param claims locations taken earlier this tick; claimed here on success
 * @returns the index, carry, and final location to persist
 */
export function walk(party: PartyRow, route: string[], claims: Set<string>,): Walk {
  let index = party.route_index;
  let progress = party.travel_progress + party.steps_per_tick;
  let edges = 0;

  while (progress >= 1 && index < route.length - 1) {
    const next = route[index + 1];
    if (!next || claims.has(next,)) { break; }
    claims.add(next,);
    index += 1;
    progress -= 1;
    edges += 1;
  }

  return {
    edges,
    routeIndex: index,
    progress,
    locationId: route[index] ?? "",
    settled: index >= route.length - 1,
  };
}
