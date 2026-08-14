/**
 * Integration Registry — housing integration edges
 *
 * Cross-system edges involving Housing. Migrated verbatim from the former
 * `buildEdges()`.
 */
import { EdgeDirection, EventDirection, type IntegrationEdge, } from "../types";

/** Integration edges involving the Housing system. */
export const HOUSING_EDGES: IntegrationEdge[] = [
  {
    source: "housing",
    target: "crafting",
    direction: EdgeDirection.DependsOn,
    interfaces: ["CraftingStation", "Recipe",],
    events: [
      {
        id: "housing.crafted",
        direction: EventDirection.Emits,
        source: "housing",
        target: "crafting",
        notes: "Crafting in home stations",
      },
    ],
  },
  {
    source: "housing",
    target: "crime",
    direction: EdgeDirection.DependedBy,
    interfaces: ["PlayerState",],
    events: [
      {
        id: "housing.burglary",
        direction: EventDirection.Subscribes,
        source: "crime",
        target: "housing",
        notes: "Crime targets housing security",
      },
    ],
  },
  {
    source: "housing",
    target: "companion",
    direction: EdgeDirection.DependedBy,
    interfaces: ["PlayerState",],
    events: [
      {
        id: "companion.housed",
        direction: EventDirection.Subscribes,
        source: "companion",
        target: "housing",
        notes: "Companion housing assigns stable/room",
      },
    ],
  },
];
