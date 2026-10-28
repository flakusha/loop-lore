// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Deterministic-path latency budget test (epic AC).
 *
 * Budget: <50ms p95 ADDED by the gate's deterministic path (claim
 * extraction + rule evaluation + config resolution, snapshot prebuilt).
 * Benchmark-style: the run reports the measured p95 to the log; the
 * assertion is deliberately generous (document, don't gate CI on it).
 */
import { describe, expect, test, } from "bun:test";

import { createLogger, getLogger, } from "../logger";
import { extractClaims, } from "./extract-claims";
import { evaluateRules, } from "./rules";
import { DEFAULT_IMMERSION_CONFIG, } from "./types";

const SAMPLE = "I sprint away from the ropes, draw my sword and pick the lock with my thieves' tools";
const ITERATIONS = 400;

/** Percentile of a sorted numeric sample. */
function percentile(sorted: number[], p: number,): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length,) - 1,);
  return sorted[Math.max(0, index,)]!;
}

describe("deterministic latency budget", () => {
  test("p95 added latency stays far below the 50ms budget", () => {
    createLogger({ level: "error", },);
    const log = getLogger().child({ module: "immersion-perf", },);
    // Prebuilt snapshot: the budget covers the deterministic ADD per
    // message (extract + evaluate), not the DB snapshot read.
    const snapshot = {
      actorId: "perf-actor",
      restricted: true,
      characterState: "active",
      conditions: ["bound",],
      skills: [],
      inventory: [],
      pendingConsequences: [],
    };

    // Warmup (JIT + module-level regex compilation).
    for (let i = 0; i < 20; i++) {
      evaluateRules({ claims: extractClaims({ content: SAMPLE, },), snapshot, config: DEFAULT_IMMERSION_CONFIG, },);
    }

    const durations: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      const claims = extractClaims({ content: SAMPLE, },);
      const verdict = evaluateRules({ claims, snapshot, config: DEFAULT_IMMERSION_CONFIG, },);
      durations.push(performance.now() - start,);
      expect(verdict,).toBeDefined();
    }

    durations.sort((a, b,) => a - b);
    const p50 = percentile(durations, 50,);
    const p95 = percentile(durations, 95,);
    log.info("immersion deterministic latency", { iterations: ITERATIONS, p50Ms: p50, p95Ms: p95, },);
    // Documented budget: 50ms. Generous assertion so slow CI machines
    // document the number without flipping the suite red.
    expect(p95,).toBeLessThan(50,);
  });
});
