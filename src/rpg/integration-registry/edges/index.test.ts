// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for the assembled integration-edge list (global invariants). */
import { describe, expect, test, } from "bun:test";
import { FACTION_EDGES, } from "./faction";
import { buildEdges, } from "./index";

describe("buildEdges", () => {
  test("every edge and event is fully addressed", () => {
    const edges = buildEdges();
    expect(edges.length,).toBeGreaterThan(0,);
    for (const edge of edges) {
      expect(edge.source.length,).toBeGreaterThan(0,);
      expect(edge.target.length,).toBeGreaterThan(0,);
      for (const event of edge.events ?? []) {
        expect(event.id.length,).toBeGreaterThan(0,);
        expect(event.source.length,).toBeGreaterThan(0,);
        expect(event.target.length,).toBeGreaterThan(0,);
      }
    }
  });

  test("faction edges link faction and social in both directions", () => {
    expect(buildEdges(),).toEqual(expect.arrayContaining(FACTION_EDGES,),);
    const faction = FACTION_EDGES[0]!;
    expect(faction.source,).toBe("faction",);
    expect(faction.target,).toBe("social",);
    expect(faction.events.map((e,) => e.id),).toEqual([
      "faction.standing_changed",
      "social.reputation_updated",
      "poll.resolved",
    ],);
  });
});
