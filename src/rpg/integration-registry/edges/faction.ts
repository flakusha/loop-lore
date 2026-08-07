/**
 * Integration Registry — faction integration edges
 *
 * Cross-system edges involving Faction. Migrated verbatim from the former
 * `buildEdges()`.
 */
import type { IntegrationEdge, } from "../types";

/** Integration edges involving the Faction system. */
export const FACTION_EDGES: IntegrationEdge[] = [
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
];
