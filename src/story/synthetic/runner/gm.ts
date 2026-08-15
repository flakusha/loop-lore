/**
 * Synthetic Test Runner — GM Escalation Dispatcher
 *
 * Heuristic escalation checks (or a deferred live-GM path).
 */
import { QuestStatus, } from "../../../db/enums-story/quests";
import { skippedResult, } from "../../shared/story-utils";
import type { SyntheticCase, } from "../types";
import type { RunnerState, SyntheticTestStatus, } from "./types";

export async function runGmEscalation(state: RunnerState, c: SyntheticCase,): Promise<{
  status: SyntheticTestStatus;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  reason?: string;
}> {
  if (!state.gameMaster) {
    const questId = (c.input as { questId?: string }).questId ?? "";
    const quest = await state.db
      .selectFrom("quests",)
      .select(["status",],)
      .where("id", "=", questId,)
      .executeTakeFirst();
    if (!quest) {
      return skippedResult(c.expected, `quest ${questId} not found`, { found: false, },);
    }
    const escalated = quest.status === QuestStatus.Active;
    const expEsc = c.expected.escalated === true;
    const passed = escalated === expEsc;
    return {
      status: passed ? "passed" : "failed",
      expected: c.expected,
      actual: { questStatus: quest.status, escalated, },
      reason: passed ? undefined : `escalated ${escalated} vs expected ${expEsc}`,
    };
  }
  // Live GM path: keep read-only — defer decision execution to the caller.
  return skippedResult(c.expected, "live GM escalation requires injected decision execution (deferred)",);
}
