// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Synthetic Test Runner — Types
 *
 * Result, summary, and options types plus the shared runner state handle.
 */
import type { Kysely, } from "kysely";
import type { SyntheticDataType, SyntheticTestMode, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import type { GameMasterService, } from "../../game-master";
import type { QualityEvaluator, } from "../../quality-evaluator";
import type { TurnManager, } from "../../turn-manager";

/** */
export type SyntheticTestStatus = "passed" | "failed" | "skipped";

/** */
export interface SyntheticTestCaseResult {
  /** Parent SyntheticData row id */
  scenarioId: string;
  caseId: string;
  scenarioType: SyntheticDataType;
  mode: SyntheticTestMode;
  status: SyntheticTestStatus;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  reason?: string;
}

/** */
export interface SyntheticTestRunSummary {
  /** Pass rate over executed (non-skipped) cases, 0..1 */
  passRate: number;
  /** Proposed overall-score thresholds (calibration mode only) */
  suggestedThresholds?: { accept: number; regenerate: number; escalate: number };
}

/** */
export interface SyntheticTestRunResult {
  runId: string;
  mode: SyntheticTestMode;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: SyntheticTestCaseResult[];
  summary: SyntheticTestRunSummary;
  startedAt: string;
  finishedAt: string;
}

/** */
export interface SyntheticTestRunnerOptions {
  db: Kysely<DB>;
  /** Pure-logic scorer (no DB needed). Constructed if omitted. */
  qualityEvaluator?: QualityEvaluator;
  /** Builds a per-chat TurnManager for orchestration replay. */
  turnManagerFactory?: (chatId: string,) => TurnManager;
  /** Used for live GM escalation decisions if provided. */
  gameMaster?: GameMasterService;
  idGenerator?: () => string;
  /** Iterations for stress / mutation defaults. */
  defaultIterations?: number;
  /** Transition fully-passing rows to `validated` after replay/regression. */
  autoValidate?: boolean;
}

/** */
export interface RowShape {
  id: string;
  chat_id: string | null;
  type: SyntheticDataType;
  generated_cases: string;
}

/** Mutable view of the runner's dependencies threaded to dispatchers */
export interface RunnerState {
  db: Kysely<DB>;
  evaluator: QualityEvaluator;
  turnManagerFactory?: (chatId: string,) => TurnManager;
  gameMaster?: GameMasterService;
  idGenerator: () => string;
  defaultIterations: number;
  autoValidate: boolean;
}
