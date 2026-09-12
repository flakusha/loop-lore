// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the integration-registry query dispatchers, exercised through
 * the `IntegrationRegistry()` factory so the factory wiring is covered too.
 *
 * All fixtures are in-memory; each test builds a fresh registry.
 */
import { describe, expect, test, } from "bun:test";
import { IntegrationRegistry, } from "./index";
import {
  type CrossSystemEvent,
  EdgeDirection,
  EventDirection,
  type IntegrationEdge,
  type InterfaceContract,
  type PlayerStateLayer,
} from "./types";

/** Minimal edge; callers override fields they care about. */
function edge(
  overrides: Partial<IntegrationEdge> & { source: IntegrationEdge["source"]; target: IntegrationEdge["target"] },
): IntegrationEdge {
  return {
    direction: EdgeDirection.DependsOn,
    interfaces: [],
    events: [],
    ...overrides,
  };
}

function contract(overrides: Partial<InterfaceContract> & { id: string },): InterfaceContract {
  return {
    kind: "shared_type",
    description: "test contract",
    sharedBy: [],
    ...overrides,
  };
}

function layer(
  overrides: Partial<PlayerStateLayer> & { id: string; owner: PlayerStateLayer["owner"] },
): PlayerStateLayer {
  return {
    classification: "exclusive",
    producers: [],
    consumers: [],
    typeName: "TestState",
    ...overrides,
  };
}

function event(overrides: Partial<CrossSystemEvent> & { id: string },): CrossSystemEvent {
  return {
    direction: EventDirection.Emits,
    source: "battle",
    target: "items",
    ...overrides,
  };
}

describe("fresh registry", () => {
  test("starts empty", () => {
    const registry = IntegrationRegistry();
    expect(registry.getUnresolvedGaps(),).toEqual([],);
    expect(registry.getGraph().size,).toBe(0,);
    expect(registry.getContract("nope",),).toBeUndefined();
    expect(registry.getEdge("battle", "items",),).toBeUndefined();
  });
});

describe("getContract / getSharedTypes / resolveEdgeInterfaces", () => {
  test("resolves a registered contract by id", () => {
    const registry = IntegrationRegistry();
    registry.addContract(contract({ id: "StatusEffect", sharedBy: ["battle", "magic",], },),);
    expect(registry.getContract("StatusEffect",)?.description,).toBe("test contract",);
  });

  test("returns contracts shared by a system only", () => {
    const registry = IntegrationRegistry();
    registry.addContract(contract({ id: "A", sharedBy: ["battle",], },),);
    registry.addContract(contract({ id: "B", sharedBy: ["magic",], },),);
    expect(registry.getSharedTypes("battle",).map((c,) => c.id),).toEqual(["A",],);
  });

  test("resolves edge interfaces, skipping unknown ids", () => {
    const registry = IntegrationRegistry();
    registry.addContract(contract({ id: "Known", },),);
    const e = edge({ source: "battle", target: "items", interfaces: ["Known", "Missing",], },);
    expect(registry.resolveEdgeInterfaces(e,).map((c,) => c.id),).toEqual(["Known",],);
  });
});

describe("getDependencies / getDependents", () => {
  test("dependencies include DependsOn and Bidirectional, exclude DependedBy", () => {
    const registry = IntegrationRegistry();
    const direct = edge({ source: "battle", target: "items", direction: EdgeDirection.DependsOn, },);
    const bidi = edge({ source: "battle", target: "crafting", direction: EdgeDirection.Bidirectional, },);
    const reverse = edge({ source: "economy", target: "battle", direction: EdgeDirection.DependedBy, },);
    registry.addEdge(direct,);
    registry.addEdge(bidi,);
    registry.addEdge(reverse,);
    expect(registry.getDependencies("battle",),).toEqual([direct, bidi,],);
  });

  test("dependents mirror the direction filter", () => {
    const registry = IntegrationRegistry();
    const dependent = edge({ source: "economy", target: "battle", direction: EdgeDirection.DependedBy, },);
    const bidi = edge({ source: "crafting", target: "battle", direction: EdgeDirection.Bidirectional, },);
    const outward = edge({ source: "battle", target: "items", direction: EdgeDirection.DependsOn, },);
    registry.addEdge(dependent,);
    registry.addEdge(bidi,);
    registry.addEdge(outward,);
    expect(registry.getDependents("battle",),).toEqual([dependent, bidi,],);
  });
});

describe("getEdge / getGap", () => {
  test("finds an edge in either argument order", () => {
    const registry = IntegrationRegistry();
    const e = edge({ source: "battle", target: "items", },);
    registry.addEdge(e,);
    expect(registry.getEdge("battle", "items",),).toBe(e,);
    expect(registry.getEdge("items", "battle",),).toBe(e,);
  });

  test("returns the gap of a gapped edge, undefined otherwise", () => {
    const registry = IntegrationRegistry();
    const gapped = edge({
      source: "crime",
      target: "social",
      gap: { gapId: "G1", severity: "high", resolved: false, },
    },);
    const plain = edge({ source: "battle", target: "items", },);
    registry.addEdge(gapped,);
    registry.addEdge(plain,);
    expect(registry.getGap("crime", "social",)?.gapId,).toBe("G1",);
    expect(registry.getGap("battle", "items",),).toBeUndefined();
    expect(registry.getGap("magic", "weather",),).toBeUndefined();
  });
});

describe("getUnresolvedGaps", () => {
  test("returns unresolved gaps severity-sorted, excluding resolved", () => {
    const registry = IntegrationRegistry();
    registry.addEdge(edge({
      source: "battle",
      target: "items",
      gap: { gapId: "G-low", severity: "low", resolved: false, },
    },),);
    registry.addEdge(edge({
      source: "crime",
      target: "social",
      gap: { gapId: "G-high", severity: "high", resolved: false, },
    },),);
    registry.addEdge(edge({
      source: "magic",
      target: "weather",
      gap: { gapId: "G-med", severity: "medium", resolved: false, },
    },),);
    registry.addEdge(edge({
      source: "economy",
      target: "housing",
      gap: { gapId: "G-done", severity: "high", resolved: true, },
    },),);
    const ids = registry.getUnresolvedGaps().map((e,) => e.gap?.gapId);
    expect(ids,).toEqual(["G-high", "G-med", "G-low",],);
  });
});

describe("getEvents", () => {
  test("returns all events touching a system", () => {
    const registry = IntegrationRegistry();
    const emitted = event({ id: "battle.hit", direction: EventDirection.Emits, },);
    const subscribed = event({
      id: "items.consume",
      direction: EventDirection.Subscribes,
      source: "items",
      target: "battle",
    },);
    const other = event({ id: "weather.changed", source: "weather", target: "exploration", },);
    registry.addEdge(edge({ source: "battle", target: "items", events: [emitted, subscribed,], },),);
    registry.addEdge(edge({ source: "weather", target: "exploration", events: [other,], },),);
    expect(registry.getEvents("battle",).map((e,) => e.id),).toEqual(["battle.hit", "items.consume",],);
  });

  test("direction filter keeps matching direction plus Both", () => {
    const registry = IntegrationRegistry();
    const emitted = event({ id: "e1", direction: EventDirection.Emits, },);
    const both = event({ id: "e2", direction: EventDirection.Both, },);
    const subscribed = event({ id: "e3", direction: EventDirection.Subscribes, },);
    registry.addEdge(edge({ source: "battle", target: "items", events: [emitted, both, subscribed,], },),);
    const ids = registry.getEvents("battle", EventDirection.Emits,).map((e,) => e.id);
    expect(ids,).toEqual(["e1", "e2",],);
  });
});

describe("getStateLayers / getGraph", () => {
  test("returns layers owned by a system only", () => {
    const registry = IntegrationRegistry();
    registry.registerStateLayer(layer({ id: "vitality", owner: "battle", },),);
    registry.registerStateLayer(layer({ id: "mood", owner: "social", },),);
    expect(registry.getStateLayers("battle",).map((l,) => l.id),).toEqual(["vitality",],);
  });

  test("builds adjacency, mirroring bidirectional edges", () => {
    const registry = IntegrationRegistry();
    registry.addEdge(edge({ source: "battle", target: "items", direction: EdgeDirection.DependsOn, },),);
    registry.addEdge(edge({
      source: "crafting",
      target: "battle",
      direction: EdgeDirection.Bidirectional,
    },),);
    const graph = registry.getGraph();
    expect(graph.get("battle",),).toEqual(["items", "crafting",],);
    expect(graph.get("crafting",),).toEqual(["battle",],);
    expect(graph.get("items",),).toEqual([],);
  });
});
