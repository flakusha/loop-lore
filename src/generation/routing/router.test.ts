// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Router tests: one per strategy, capability filtering, determinism, the
 * unknown-metadata rule, and the config-rule / fallback-cap knobs.
 */
import { describe, expect, it, } from "bun:test";
import { ModelRouter, type RoutableModel, } from "./router";
import type { GenerationRoutingConfig, } from "./routing-config";
import { AUTO_GEN, INTERACTIVE_TURN, type TaskSignal, } from "./task-signal";

/** A candidate with no cost/latency annotations — the common case. */
function bare(name: string,): RoutableModel {
  return { name, model: `${name}-model`, capabilities: {}, };
}

/** Names of a route's full order, primary first. */
function order(result: { primary: RoutableModel | null; fallbacks: RoutableModel[] },): string[] {
  return [result.primary?.name ?? "", ...result.fallbacks.map((m,) => m.name),];
}

describe("ModelRouter", () => {
  describe("capability-match (default)", () => {
    it("preserves input order for unannotated candidates — the no-op property", () => {
      const router = new ModelRouter();
      const result = router.route(INTERACTIVE_TURN, [bare("a",), bare("b",), bare("c",),],);
      expect(order(result,),).toEqual(["a", "b", "c",],);
    });

    it("drops candidates that declare a missing required capability", () => {
      const router = new ModelRouter();
      const signal: TaskSignal = { ...INTERACTIVE_TURN, requiresCapabilities: ["tools",], };
      const result = router.route(signal, [
        { ...bare("no-tools",), capabilities: { tools: false, }, },
        { ...bare("yes-tools",), capabilities: { tools: true, }, },
        bare("unknown",),
      ],);
      expect(order(result,),).toEqual(["yes-tools", "unknown",],);
    });

    it("keeps every candidate when nothing declares the requirement", () => {
      const router = new ModelRouter();
      const signal: TaskSignal = { ...INTERACTIVE_TURN, requiresCapabilities: ["embeddings",], };
      const result = router.route(signal, [bare("a",), bare("b",),],);
      expect(order(result,),).toEqual(["a", "b",],);
    });
  });

  describe("cheapest", () => {
    it("sorts ascending by cost and ranks unknown cost last", () => {
      const router = new ModelRouter({ strategy: "cheapest", },);
      const result = router.route(INTERACTIVE_TURN, [
        { ...bare("pricey",), costPer1kTokens: 0.03, },
        bare("unknown",),
        { ...bare("cheap",), costPer1kTokens: 0.001, },
        { ...bare("mid",), costPer1kTokens: 0.01, },
      ],);
      expect(order(result,),).toEqual(["cheap", "mid", "pricey", "unknown",],);
    });

    it("does not throw when no candidate carries cost metadata", () => {
      const router = new ModelRouter({ strategy: "cheapest", },);
      const result = router.route(INTERACTIVE_TURN, [bare("a",), bare("b",),],);
      expect(order(result,),).toEqual(["a", "b",],);
    });
  });

  describe("fastest", () => {
    it("sorts ascending by latency and ranks unknown latency last", () => {
      const router = new ModelRouter({ strategy: "fastest", },);
      const result = router.route(INTERACTIVE_TURN, [
        { ...bare("slow",), avgLatencyMs: 900, },
        bare("unknown",),
        { ...bare("fast",), avgLatencyMs: 120, },
      ],);
      expect(order(result,),).toEqual(["fast", "slow", "unknown",],);
    });
  });

  describe("round-robin", () => {
    it("rotates the primary across successive calls with the same signal", () => {
      const router = new ModelRouter({ strategy: "round-robin", },);
      const candidates = [bare("a",), bare("b",), bare("c",),];
      const primaries = [0, 1, 2, 0,].map(() => router.route(INTERACTIVE_TURN, candidates,).primary?.name);
      expect(primaries,).toEqual(["a", "b", "c", "a",],);
    });

    it("keeps the rotated order internally consistent within one call", () => {
      const router = new ModelRouter({ strategy: "round-robin", },);
      router.route(INTERACTIVE_TURN, [bare("x",),],);
      const result = router.route(INTERACTIVE_TURN, [bare("x",), bare("y",),],);
      expect(order(result,),).toEqual(["y", "x",],);
    });

    // The cursor used to advance on every call, so one rule-overridden route
    // silently consumed a round-robin slot and rotated the next one early.
    it("does not spend a slot on a call routed by a rule override", () => {
      const router = new ModelRouter({
        strategy: "round-robin",
        rules: [{ taskType: "interactive-turn", strategy: "cheapest", },],
      },);
      router.route(INTERACTIVE_TURN, [bare("a",), bare("b",),],);
      expect(order(router.route(AUTO_GEN, [bare("a",), bare("b",),],),),).toEqual(["a", "b",],);
    });
  });

  describe("config rules", () => {
    it("applies a per-taskType strategy override over the default strategy", () => {
      const config: GenerationRoutingConfig = {
        strategy: "cheapest",
        rules: [{ taskType: "interactive-turn", strategy: "fastest", },],
      };
      const router = new ModelRouter(config,);
      const result = router.route(INTERACTIVE_TURN, [
        { ...bare("slow",), avgLatencyMs: 900, costPer1kTokens: 0.0001, },
        { ...bare("fast",), avgLatencyMs: 100, costPer1kTokens: 0.05, },
      ],);
      expect(order(result,),).toEqual(["fast", "slow",],);
    });

    it("caps the fallback chain at config.fallbacks", () => {
      const router = new ModelRouter({ strategy: "cheapest", fallbacks: 1, },);
      const result = router.route(INTERACTIVE_TURN, [
        { ...bare("a",), costPer1kTokens: 3, },
        { ...bare("b",), costPer1kTokens: 2, },
        { ...bare("c",), costPer1kTokens: 1, },
      ],);
      expect(order(result,),).toEqual(["c", "b",],);
    });
  });

  describe("edge cases", () => {
    it("returns an empty route for an empty candidate list", () => {
      const result = new ModelRouter().route(INTERACTIVE_TURN, [],);
      expect(result.primary,).toBeNull();
      expect(result.fallbacks,).toEqual([],);
    });

    it("returns the single candidate as primary with no fallbacks", () => {
      const result = new ModelRouter().route(INTERACTIVE_TURN, [bare("solo",),],);
      expect(order(result,),).toEqual(["solo",],);
    });

    it("is deterministic: the same input yields the same order", () => {
      const candidates = [
        { ...bare("a",), costPer1kTokens: 2, avgLatencyMs: 50, },
        { ...bare("b",), costPer1kTokens: 1, avgLatencyMs: 90, },
        bare("c",),
      ];
      for (const strategy of ["capability-match", "cheapest", "fastest",] as const) {
        const router = new ModelRouter({ strategy, },);
        const first = order(router.route(INTERACTIVE_TURN, candidates,),);
        const second = order(router.route(INTERACTIVE_TURN, candidates,),);
        expect(first,).toEqual(second,);
      }
    });
  });
});
