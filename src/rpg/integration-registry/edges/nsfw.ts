// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration Registry — NSFW integration edges
 *
 * Cross-system edges involving NSFW. Migrated verbatim from the former
 * `buildEdges()`.
 */
import { EdgeDirection, EventDirection, type IntegrationEdge, } from "../types";

/** Integration edges involving the NSFW system. */
export const NSFW_EDGES: IntegrationEdge[] = [
  {
    source: "nsfw",
    target: "housing",
    direction: EdgeDirection.DependsOn,
    interfaces: ["PlayerState",],
    events: [
      {
        id: "housing.nsfw_encounter",
        direction: EventDirection.Subscribes,
        source: "housing",
        target: "nsfw",
        notes: "Housing provides private spaces with comfort bonuses",
      },
    ],
  },
  {
    source: "nsfw",
    target: "weather",
    direction: EdgeDirection.DependsOn,
    interfaces: ["PlayerState",],
    events: [
      {
        id: "weather.changed",
        direction: EventDirection.Subscribes,
        source: "weather",
        target: "nsfw",
        notes: "Weather affects encounter mood and location availability",
      },
    ],
  },
  {
    source: "nsfw",
    target: "social",
    direction: EdgeDirection.DependsOn,
    interfaces: ["ReputationScore", "Relationship",],
    events: [
      {
        id: "nsfw.reputation_changed",
        direction: EventDirection.Emits,
        source: "nsfw",
        target: "social",
        notes: "NSFW reputation feeds social standing",
      },
    ],
  },
];
