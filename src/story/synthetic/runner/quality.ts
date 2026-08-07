/**
 * Synthetic Test Runner — Quality Dispatchers
 *
 * Quality evaluation (replay/regression/calibration/mutation/stress)
 * and regeneration-baseline logic.
 */
import { SyntheticTestMode, } from "../../../db/enums";
import type { CaseResult, } from "../../shared/story-utils";
import { collectScoresAndVariance, varianceResult, } from "../../shared/story-utils";
import type { SyntheticCase, } from "../types";
import type { RunnerState, SyntheticTestStatus, } from "./types";

export function runQuality(
  state: RunnerState,
  c: SyntheticCase,
  mode: SyntheticTestMode,
  mutationParams?: { temperatureVariance?: number; promptVariations?: number },
): CaseResult {
  const input = c.input;
  const response = (input as { content?: string }).content ?? "";
  const actorName = (input as { actorId?: string }).actorId ?? "narrator";

  if (mode === SyntheticTestMode.Mutation) {
    const variations = Math.max(1, mutationParams?.promptVariations ?? 3,);
    const tolerance = (mutationParams?.temperatureVariance ?? 0.2) * 100;
    const { scores, variance, } = collectScoresAndVariance(
      (i,) => state.evaluator.evaluate({ response: `${response} ${i}`, prompt: "", actorName, },).scores.overall,
      variations,
    );
    const passed = variance <= tolerance;
    return varianceResult(
      scores,
      variance,
      passed,
      { ...c.expected, tolerance, },
      passed ? undefined : `variance ${variance} exceeds tolerance ${tolerance}`,
    );
  }

  if (mode === SyntheticTestMode.Stress) {
    const iterations = Math.max(1, state.defaultIterations,);
    const { scores, variance, } = collectScoresAndVariance(
      () => state.evaluator.evaluate({ response, prompt: "", actorName, },).scores.overall,
      iterations,
    );
    const passed = variance === 0;
    return varianceResult(
      scores,
      variance,
      passed,
      { ...c.expected, iterations, },
      passed ? undefined : `inconsistent across ${iterations} runs (variance ${variance})`,
    );
  }

  // replay / regression / calibration
  const result = state.evaluator.evaluate({ response, prompt: "", actorName, },);
  const actual = { score: result.scores.overall, passed: result.passed, };
  const expPassed = typeof c.expected.passed === "boolean" ? c.expected.passed : true;
  const minScore = typeof c.expected.minScore === "number" ? c.expected.minScore : 0;
  const passed = result.passed === expPassed && result.scores.overall >= minScore;
  return {
    status: passed ? "passed" : "failed",
    expected: c.expected,
    actual,
    reason: passed
      ? undefined
      : `score ${result.scores.overall} vs expected passed=${expPassed} min=${minScore}`,
  };
}

export function regenerationLogic(state: RunnerState, c: SyntheticCase,): {
  status: SyntheticTestStatus;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  reason?: string;
} {
  const originalInput = c.input as { original?: string; actorId?: string };
  const original = originalInput.original ?? "";
  const actorName = originalInput.actorId ?? "narrator";
  const baseline = state.evaluator.evaluate({ response: original, prompt: "", actorName, },).scores.overall;
  const improvedThresh = Number(c.expected.improvedScore ?? 0.7,) * 100;
  const warranted = baseline < improvedThresh;
  const expRegen = c.expected.regenerated === true;
  const passed = warranted === expRegen;
  return {
    status: passed ? "passed" : "failed",
    expected: c.expected,
    actual: { originalScore: baseline, warranted, improvedThresh, },
    reason: passed ? undefined : `warranted ${warranted} vs expected ${expRegen}`,
  };
}
