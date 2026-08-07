/**
 * Integration Registry — housing integration edges
 *
 * Cross-system edges involving Housing. Migrated verbatim from the former
 * `buildEdges()`.
 */
import type { IntegrationEdge, } from "../types";

/** Integration edges involving the Housing system. */
export const HOUSING_EDGES: IntegrationEdge[] = [
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
];
