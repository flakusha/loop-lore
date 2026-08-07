/**
 * Integration Registry — NSFW integration edges
 *
 * Cross-system edges involving NSFW. Migrated verbatim from the former
 * `buildEdges()`.
 */
import type { IntegrationEdge, } from "../types";

/** Integration edges involving the NSFW system. */
export const NSFW_EDGES: IntegrationEdge[] = [
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
];
