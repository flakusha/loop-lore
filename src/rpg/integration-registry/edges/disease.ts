/**
 * Integration Registry — disease integration edges
 *
 * Cross-system edges involving Disease. Migrated verbatim from the former
 * `buildEdges()`.
 */
import type { IntegrationEdge, } from "../types";

/** Integration edges involving the Disease system. */
export const DISEASE_EDGES: IntegrationEdge[] = [
  {
    source: "disease",
    target: "weather",
    direction: "depends_on",
    interfaces: ["PlayerState",],
    events: [
      {
        id: "weather.changed",
        direction: "subscribes",
        source: "weather",
        target: "disease",
        notes: "Rain spreads waterborne disease; cold weakens immunity",
      },
      {
        id: "disease.plague_zone",
        direction: "emits",
        source: "disease",
        target: "weather",
        notes: "Active plague affects weather (pestilence fog)",
      },
    ],
  },
  {
    source: "disease",
    target: "nsfw",
    direction: "depended_by",
    interfaces: ["StatusEffect", "PlayerState",],
    events: [
      {
        id: "disease.reproductive_health",
        direction: "subscribes",
        source: "nsfw",
        target: "disease",
        notes: "STDs, pregnancy complications",
      },
      {
        id: "nsfw.encounter_completed",
        direction: "subscribes",
        source: "nsfw",
        target: "disease",
        notes: "Triggers health check after intimate encounter",
      },
    ],
  },
];
