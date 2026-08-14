/**
 * Integration Registry — disease integration edges
 *
 * Cross-system edges involving Disease. Migrated verbatim from the former
 * `buildEdges()`.
 */
import { type IntegrationEdge, EdgeDirection, EventDirection, } from "../types";

/** Integration edges involving the Disease system. */
export const DISEASE_EDGES: IntegrationEdge[] = [
  {
    source: "disease",
    target: "weather",
    direction: EdgeDirection.DependsOn,
    interfaces: ["PlayerState",],
    events: [
      {
        id: "weather.changed",
        direction: EventDirection.Subscribes,
        source: "weather",
        target: "disease",
        notes: "Rain spreads waterborne disease; cold weakens immunity",
      },
      {
        id: "disease.plague_zone",
        direction: EventDirection.Emits,
        source: "disease",
        target: "weather",
        notes: "Active plague affects weather (pestilence fog)",
      },
    ],
  },
  {
    source: "disease",
    target: "nsfw",
    direction: EdgeDirection.DependedBy,
    interfaces: ["StatusEffect", "PlayerState",],
    events: [
      {
        id: "disease.reproductive_health",
        direction: EventDirection.Subscribes,
        source: "nsfw",
        target: "disease",
        notes: "STDs, pregnancy complications",
      },
      {
        id: "nsfw.encounter_completed",
        direction: EventDirection.Subscribes,
        source: "nsfw",
        target: "disease",
        notes: "Triggers health check after intimate encounter",
      },
    ],
  },
];
