/**
 * Synthetic Test Runner — Quest Progression Dispatcher
 *
 * Read-only quest progression checks against live DB state.
 */
import { skippedResult, } from "../../shared/story-utils";
import type { SyntheticCase, } from "../types";
import type { RunnerState, SyntheticTestStatus, } from "./types";

export async function runQuestProgression(state: RunnerState, c: SyntheticCase,): Promise<{
  status: SyntheticTestStatus;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  reason?: string;
}> {
  const questId = (c.input as { questId?: string }).questId ?? "";
  const currentProgress = (c.input as { currentProgress?: number }).currentProgress ?? 0;
  const quest = await state.db
    .selectFrom("quests",)
    .select(["target", "status",],)
    .where("id", "=", questId,)
    .executeTakeFirst();
  if (!quest) {
    return skippedResult(c.expected, `quest ${questId} not found`, { found: false, },);
  }

  const target = quest.target || 100;
  const step = Math.max(1, Math.round(target * 0.1,),);
  const nextProgress = Math.min(currentProgress + step, target,);
  const newStatus = nextProgress >= target ? "completed" : "active";
  const advanced = nextProgress > currentProgress;

  const expStatus = c.expected.status;
  const expAdvanced = c.expected.advanced;
  const statusOk = typeof expStatus !== "string" || newStatus === expStatus;
  const advancedOk = typeof expAdvanced !== "boolean" || advanced === expAdvanced;
  const passed = statusOk && advancedOk;

  return {
    status: passed ? "passed" : "failed",
    expected: c.expected,
    actual: { target, step, nextProgress, newStatus, advanced, },
    reason: passed ? undefined : `expected status=${String(expStatus,)} advanced=${String(expAdvanced,)}`,
  };
}
