// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Synthetic Test Runner — Phase 6 Story Infrastructure
 *
 * Executes captured SyntheticData scenarios against the story pipeline and
 * reports pass/fail per case. Five modes:
 *
 * - replay       — re-run each scenario through its pipeline component
 * - regression   — replay, requiring results to match the captured expectation
 * - mutation     — jitter inputs (temperatureVariance / promptVariations) and
 *                  assert score stability for quality cases
 * - calibration  — run all quality cases and propose threshold adjustments
 * - stress       — repeat each case N times and assert consistency
 *
 * Method bodies live in sibling dispatcher modules (run, cases, quality,
 * structural, quest, gm) threaded with an explicit `RunnerState` handle. The
 * class is kept so the constructor-based public surface is unchanged.
 */
import type { Kysely, } from "kysely";
import type { SyntheticTestMode, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { uid, } from "../../../utils";
import type { GameMasterService, } from "../../game-master";
import type { QualityEvaluator, } from "../../quality-evaluator";
import { createQualityEvaluator, } from "../../quality-evaluator";
import type { TurnManager, } from "../../turn-manager";
import { SyntheticGenerator, } from "../generator";
import { run, } from "./run";
import type {
  RunnerState,
  SyntheticTestRunnerOptions,
  SyntheticTestRunResult,
} from "./types";

export type {
  RunnerState,
  SyntheticTestCaseResult,
  SyntheticTestRunnerOptions,
  SyntheticTestRunResult,
  SyntheticTestRunSummary,
  SyntheticTestStatus,
} from "./types";

/**
 * Executes synthetic QA scenarios against the story pipeline.
 */
export class SyntheticTestRunner {
  private readonly db: Kysely<DB>;
  private readonly evaluator: QualityEvaluator;
  private readonly turnManagerFactory?: (chatId: string,) => TurnManager;
  private readonly gameMaster?: GameMasterService;
  private readonly generator: SyntheticGenerator;
  private readonly idGenerator: () => string;
  private readonly defaultIterations: number;
  private readonly autoValidate: boolean;

  constructor(options: SyntheticTestRunnerOptions,) {
    this.db = options.db;
    this.evaluator = options.qualityEvaluator ?? createQualityEvaluator();
    this.turnManagerFactory = options.turnManagerFactory;
    this.gameMaster = options.gameMaster;
    this.generator = new SyntheticGenerator({ db: options.db, },);
    this.idGenerator = options.idGenerator ?? (() => uid());
    this.defaultIterations = options.defaultIterations ?? 5;
    this.autoValidate = options.autoValidate ?? false;
  }

  private get state(): RunnerState {
    return {
      db: this.db,
      evaluator: this.evaluator,
      turnManagerFactory: this.turnManagerFactory,
      gameMaster: this.gameMaster,
      idGenerator: this.idGenerator,
      defaultIterations: this.defaultIterations,
      autoValidate: this.autoValidate,
    };
  }

  /**
   * Run a batch of scenarios in the requested mode.
   */
  async run(
    scenarioIds: string[],
    mode: SyntheticTestMode,
    mutationParams?: { temperatureVariance?: number; promptVariations?: number },
  ): Promise<SyntheticTestRunResult> {
    return run(this.state, this.generator, scenarioIds, mode, mutationParams,);
  }
}
