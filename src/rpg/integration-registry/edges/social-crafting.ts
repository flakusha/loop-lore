/**
 * Integration Registry — social & crafting integration edges
 *
 * Social (poll-driven) and Crafting ↔ Magic edges. Migrated verbatim from the
 * former `buildEdges()`.
 */
import type { IntegrationEdge, } from "../types";

/** Integration edges rooted at Social (polls) and Crafting. */
export const SOCIAL_CRAFTING_EDGES: IntegrationEdge[] = [
  // ── Social (Polls) ──
  {
    source: "social",
    target: "housing",
    direction: "depends_on",
    interfaces: ["Relationship",],
    events: [
      {
        id: "poll.resolved",
        direction: "emits",
        source: "social",
        target: "housing",
        notes: "Decoration contest voting drives housing contest results",
      },
    ],
  },

  // ── Crafting ──
  {
    source: "crafting",
    target: "magic",
    direction: "bidirectional",
    interfaces: ["Recipe", "Item",],
    events: [
      {
        id: "magic.enchantment_applied",
        direction: "subscribes",
        source: "magic",
        target: "crafting",
        notes: "Enchanting as cross-system feature",
      },
      {
        id: "crafting.item_crafted",
        direction: "emits",
        source: "crafting",
        target: "magic",
        notes: "Crafted item can receive enchantment",
      },
    ],
  },
];
