// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration Registry — integration edges
 *
 * Reassembles the per-domain edge lists into the single `buildEdges()` used to
 * seed the registry with `integration.addEdge(...)`. Order is the same as the
 * former `src/rpg/integration-registry.ts` function, grouped by domain file.
 */
import type { IntegrationEdge, } from "../types";
import { BATTLE_EDGES, } from "./battle";
import { CORE_MISC_EDGES, } from "./core-misc";
import { CRIME_EDGES, } from "./crime";
import { DISEASE_EDGES, } from "./disease";
import { FACTION_EDGES, } from "./faction";
import { HOUSING_EDGES, } from "./housing";
import { NSFW_EDGES, } from "./nsfw";
import { SOCIAL_CRAFTING_EDGES, } from "./social-crafting";

/** The complete list of integration edges between RPG sub-systems. */
export function buildEdges(): IntegrationEdge[] {
  return [
    ...BATTLE_EDGES,
    ...CRIME_EDGES,
    ...FACTION_EDGES,
    ...DISEASE_EDGES,
    ...NSFW_EDGES,
    ...HOUSING_EDGES,
    ...SOCIAL_CRAFTING_EDGES,
    ...CORE_MISC_EDGES,
  ];
}
