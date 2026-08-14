/**
 * Integration Registry — faction integration edges
 *
 * Cross-system edges involving Faction. Migrated verbatim from the former
 * `buildEdges()`.
 */
import { EdgeDirection, EventDirection, type IntegrationEdge, } from "../types";

/** Integration edges involving the Faction system. */
export const FACTION_EDGES: IntegrationEdge[] = [
  {
    source: "faction",
    target: "social",
    direction: EdgeDirection.Bidirectional,
    interfaces: ["ReputationScore",],
    events: [
      {
        id: "faction.standing_changed",
        direction: EventDirection.Emits,
        source: "faction",
        target: "social",
        notes: "Faction standing affects social interactions",
      },
      {
        id: "social.reputation_updated",
        direction: EventDirection.Emits,
        source: "social",
        target: "faction",
        notes: "Social reputation affects faction relationships",
      },
      {
        id: "poll.resolved",
        direction: EventDirection.Emits,
        source: "social",
        target: "faction",
        notes: "Faction leadership/election polls drive faction state changes",
      },
    ],
    notes:
      "G14: Shared ReputationScore type MUST be defined once, used by both systems. Polls can drive faction decisions.",
  },
];
