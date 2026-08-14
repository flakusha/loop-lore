/**
 * Integration Registry — crime integration edges
 *
 * Cross-system edges involving Crime. Migrated verbatim from the former
 * `buildEdges()`.
 */
import { type IntegrationEdge, EdgeDirection, EventDirection, } from "../types";

/** Integration edges involving the Crime system. */
export const CRIME_EDGES: IntegrationEdge[] = [
  {
    source: "crime",
    target: "economy",
    direction: EdgeDirection.Bidirectional,
    interfaces: ["Item",],
    events: [
      {
        id: "crime.black_market_open",
        direction: EventDirection.Emits,
        source: "crime",
        target: "economy",
        notes: "Black market pricing uses economy mechanics",
      },
      {
        id: "economy.stolen_goods_listed",
        direction: EventDirection.Emits,
        source: "economy",
        target: "crime",
        notes: "Stolen items enter economy as trade goods",
      },
    ],
  },
  {
    source: "crime",
    target: "social",
    direction: EdgeDirection.Bidirectional,
    interfaces: ["ReputationScore",],
    events: [
      {
        id: "crime.reputation_changed",
        direction: EventDirection.Emits,
        source: "crime",
        target: "social",
        notes: "Criminal reputation affects social standing",
      },
      {
        id: "social.deception_check",
        direction: EventDirection.Subscribes,
        source: "social",
        target: "crime",
        notes: "Social skills aid crime (disguise, deception)",
      },
    ],
  },
];
