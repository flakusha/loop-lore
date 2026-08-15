/**
 * Synthetic Test Runner — Run Dispatcher
 *
 * Orchestrates a batch run across scenarios/cases, aggregates the
 * pass/fail counts, and (optionally) auto-validates passing rows.
 */
import { SyntheticDataStatus, SyntheticDataType, SyntheticTestMode, } from "../../../db/enums";
import { jsonParseOr, } from "../../../utils";
import { countByStatus, } from "../../shared/story-utils";
import type { SyntheticGenerator, } from "../generator";
import type { SyntheticCase, } from "../types";
import { executeCase, } from "./cases";
import type {
  RowShape,
  RunnerState,
  SyntheticTestCaseResult,
  SyntheticTestRunResult,
  SyntheticTestRunSummary,
} from "./types";

export async function run(
  state: RunnerState,
  generator: SyntheticGenerator,
  scenarioIds: string[],
  mode: SyntheticTestMode,
  mutationParams?: { temperatureVariance?: number; promptVariations?: number },
): Promise<SyntheticTestRunResult> {
  const runId = state.idGenerator();
  const startedAt = new Date().toISOString();

  const rows = scenarioIds.length > 0 ? await loadRows(state, scenarioIds,) : [];
  const results: SyntheticTestCaseResult[] = [];
  const qualityScores: number[] = [];

  for (const row of rows) {
    const cases = jsonParseOr<SyntheticCase[]>(row.generated_cases, [],);
    if (!Array.isArray(cases,) || cases.length === 0) { continue; }

    const rowResults: SyntheticTestCaseResult[] = [];
    for (const c of cases) {
      const r = await executeCase(state, row, c, mode, mutationParams,);
      rowResults.push(r,);
      if (
        row.type === SyntheticDataType.QualityEvaluation &&
        r.status !== "skipped" &&
        typeof r.actual.score === "number"
      ) {
        qualityScores.push(r.actual.score,);
      }
    }
    results.push(...rowResults,);

    let allPassed = true;
    for (const r of rowResults) {
      if (r.status !== "passed") {
        allPassed = false;
        break;
      }
    }
    if (
      allPassed &&
      state.autoValidate &&
      (mode === SyntheticTestMode.Replay || mode === SyntheticTestMode.Regression) &&
      rowResults.length > 0
    ) {
      await generator.transitionStatus(row.id, SyntheticDataStatus.Validated,);
    }
  }

  const { passed, failed, skipped, } = countByStatus(results,);

  const executed = results.length - skipped;
  const summary: SyntheticTestRunSummary = {
    passRate: executed > 0 ? passed / executed : 0,
  };
  if (mode === SyntheticTestMode.Calibration && qualityScores.length > 0) {
    summary.suggestedThresholds = suggestThresholds(qualityScores,);
  }

  return {
    runId,
    mode,
    total: results.length,
    passed,
    failed,
    skipped,
    results,
    summary,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

function suggestThresholds(scores: number[],): { accept: number; regenerate: number; escalate: number } {
  const sorted = [...scores,].sort((a, b,) => a - b);
  const pct = (p: number,): number => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p,),)] ?? 0;
  return {
    accept: pct(0.5,),
    regenerate: pct(0.3,),
    escalate: pct(0.15,),
  };
}

async function loadRows(state: RunnerState, ids: string[],): Promise<RowShape[]> {
  return state.db
    .selectFrom("synthetic_data",)
    .select(["id", "chat_id", "type", "generated_cases",],)
    .where("id", "in", ids,)
    .execute();
}
