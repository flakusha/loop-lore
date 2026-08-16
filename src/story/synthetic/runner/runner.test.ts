/**
 * Tests for the Synthetic Test Runner (replay/regression/mutation/stress/
 * calibration + case dispatch + run orchestration).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { SyntheticDataStatus, SyntheticDataType, SyntheticTestMode, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../../test-utils/insert-helpers";
import { QualityEvaluator, } from "../../quality-evaluator";
import type { SyntheticCase, } from "../types";
import { executeCase, } from "./cases";
import { SyntheticTestRunner, } from "./index";
import type { RunnerState, } from "./types";

const alwaysPassEvaluator = new QualityEvaluator({
  thresholds: { accept: 0, regenerate: 0, escalate: 0, maxRegenerations: 3, },
},);
const alwaysFailEvaluator = new QualityEvaluator({
  thresholds: { accept: 101, regenerate: 0, escalate: 0, maxRegenerations: 3, },
},);

function makeCase(overrides: Partial<SyntheticCase> = {},): SyntheticCase {
  return {
    id: "case-1",
    type: "quality",
    description: "test case",
    input: { content: "The hero advances.", actorId: "hero", },
    expected: {},
    ...overrides,
  };
}

describe("Synthetic Test Runner", () => {
  let db: Kysely<DB>;
  const userId: string = crypto.randomUUID();
  const actorId: string = crypto.randomUUID();
  const worldId = "test-world-synthetic-runner";
  const questId: string = crypto.randomUUID();
  const rowId: string = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, `user-${userId}`, "Tester", { id: userId, } as never,);
    await insertActors(db, "Hero", { id: actorId, user_id: userId, owner_id: userId, } as never,);
    await db.insertInto("worlds",).values({ id: worldId, name: "W", owner_id: userId, },).execute();
    await db.insertInto("quests",).values({
      id: questId,
      world_id: worldId,
      creator_id: actorId,
      name: "Fetch",
      type: "collection",
      status: "active",
      target: 100,
      progress: 0,
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  function makeState(overrides: Partial<RunnerState> = {},): RunnerState {
    return {
      db,
      evaluator: alwaysPassEvaluator,
      idGenerator: () => `run-${crypto.randomUUID()}`,
      defaultIterations: 3,
      autoValidate: false,
      ...overrides,
    };
  }

  // ── Quality dispatch ────────────────────────────────────

  describe("runQuality", () => {
    test("passes when the evaluator accepts the response", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.QualityEvaluation,
          generated_cases: "[]",
        },
        makeCase({ expected: { passed: true, }, },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("passed",);
      expect(r.actual,).toMatchObject({ passed: true, },);
      expect(r.mode,).toBe(SyntheticTestMode.Replay,);
      expect(r.scenarioId,).toBe(rowId,);
    });

    test("fails when the evaluator rejects the response", async () => {
      const r = await executeCase(
        makeState({ evaluator: alwaysFailEvaluator, },),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.QualityEvaluation,
          generated_cases: "[]",
        },
        makeCase({ expected: { passed: true, }, },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("failed",);
    });

    test("enforces a minimum score from the expected object", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.QualityEvaluation,
          generated_cases: "[]",
        },
        makeCase({ expected: { passed: true, minScore: 200, }, },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("failed",);
      expect(r.reason,).toContain("min=200",);
    });

    test("mutation mode runs the requested number of variations", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.QualityEvaluation,
          generated_cases: "[]",
        },
        makeCase({ expected: { passed: true, }, },),
        SyntheticTestMode.Mutation,
        {
          temperatureVariance: 1,
          promptVariations: 4,
        },
      );
      expect(r.status,).toBe("passed",);
      expect((r.actual as { scores: number[] }).scores,).toHaveLength(4,);
    });

    test("stress mode runs defaultIterations and requires zero variance", async () => {
      const r = await executeCase(
        makeState({ defaultIterations: 5, },),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.QualityEvaluation,
          generated_cases: "[]",
        },
        makeCase({ expected: { passed: true, }, },),
        SyntheticTestMode.Stress,
      );
      expect(r.status,).toBe("passed",);
      expect((r.actual as { scores: number[] }).scores,).toHaveLength(5,);
      expect((r.actual as { variance: number }).variance,).toBe(0,);
    });
  });

  // ── Regeneration logic ──────────────────────────────────

  describe("regenerationLogic", () => {
    function evaluatorWithBaseline(overall: number,): QualityEvaluator {
      return {
        evaluate: () => ({ scores: { overall, }, passed: overall >= 70, }),
      } as unknown as QualityEvaluator;
    }

    test("warrants regeneration when the baseline is below the threshold", async () => {
      const r = await executeCase(
        makeState({ evaluator: evaluatorWithBaseline(20,), },),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.RegenerationCase,
          generated_cases: "[]",
        },
        makeCase({
          input: { original: "meh", actorId: "hero", },
          expected: { regenerated: true, },
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("passed",);
      expect(r.actual,).toMatchObject({ warranted: true, },);
    });

    test("does not warrant regeneration for a high-quality baseline", async () => {
      const r = await executeCase(
        makeState({ evaluator: evaluatorWithBaseline(90,), },),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.RegenerationCase,
          generated_cases: "[]",
        },
        makeCase({
          input: { original: "The hero slew the dragon.", actorId: "hero", },
          expected: { regenerated: false, },
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("passed",);
      expect(r.actual,).toMatchObject({ warranted: false, },);
    });
  });

  // ── Turn sequence ───────────────────────────────────────

  describe("runTurnSequence", () => {
    test("skips without a turnManagerFactory", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.TurnSequence,
          generated_cases: "[]",
        },
        makeCase({ expected: { nextActorId: "actor-1", }, },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("skipped",);
      expect(r.reason,).toContain("turnManagerFactory",);
    });

    test("passes when nextActorId is well-formed with a factory", async () => {
      const r = await executeCase(
        makeState({
          turnManagerFactory: () => ({}) as never,
        },),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.TurnSequence,
          generated_cases: "[]",
        },
        makeCase({ expected: { nextActorId: "actor-1", }, },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("passed",);
      expect(r.actual,).toEqual({ nextActorId: "actor-1", structural: true, },);
    });

    test("fails on a malformed nextActorId", async () => {
      const r = await executeCase(
        makeState({
          turnManagerFactory: () => ({}) as never,
        },),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.TurnSequence,
          generated_cases: "[]",
        },
        makeCase({ expected: { nextActorId: 42, }, },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("failed",);
    });
  });

  // ── World state transitions ─────────────────────────────

  describe("runWorldStateTransition", () => {
    test("passes for a consistent transition and reports changed keys", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.WorldStateTransition,
          generated_cases: "[]",
        },
        makeCase({
          input: { from: { gold: 10, name: "a", }, to: { gold: 20, name: "a", }, },
          expected: {},
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("passed",);
      expect(r.actual,).toMatchObject({ consistent: true, changedKeys: ["gold",], },);
    });

    test("fails when a key changes type", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.WorldStateTransition,
          generated_cases: "[]",
        },
        makeCase({
          input: { from: { gold: 10, }, to: { gold: "many", }, },
          expected: {},
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("failed",);
    });

    test("passes when inconsistency is expected", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.WorldStateTransition,
          generated_cases: "[]",
        },
        makeCase({
          input: { from: { gold: 10, }, to: { gold: "many", }, },
          expected: { consistent: false, },
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("passed",);
    });
  });

  // ── GM escalation ───────────────────────────────────────

  describe("runGmEscalation", () => {
    test("escalates an active quest when no live GM is wired", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.GmEscalation,
          generated_cases: "[]",
        },
        makeCase({
          input: { questId, },
          expected: { escalated: true, },
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("passed",);
      expect(r.actual,).toMatchObject({ questStatus: "active", escalated: true, },);
    });

    test("does not escalate an inactive quest", async () => {
      await db.updateTable("quests",).set({ status: "completed", },).where("id", "=", questId,).execute();
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.GmEscalation,
          generated_cases: "[]",
        },
        makeCase({
          input: { questId, },
          expected: { escalated: false, },
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("passed",);
    });

    test("skips when the quest is missing", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.GmEscalation,
          generated_cases: "[]",
        },
        makeCase({
          input: { questId: "missing-quest", },
          expected: {},
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("skipped",);
      expect(r.reason,).toContain("not found",);
    });

    test("defers when a live GM is wired", async () => {
      const r = await executeCase(
        makeState({
          gameMaster: {} as never,
        },),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.GmEscalation,
          generated_cases: "[]",
        },
        makeCase({ expected: {}, },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("skipped",);
      expect(r.reason,).toContain("deferred",);
    });
  });

  // ── Quest progression ───────────────────────────────────

  describe("runQuestProgression", () => {
    test("computes progress and completion status", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.QuestProgression,
          generated_cases: "[]",
        },
        makeCase({
          input: { questId, currentProgress: 90, },
          expected: { status: "completed", advanced: true, },
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("passed",);
      expect(r.actual,).toMatchObject({ target: 100, nextProgress: 100, newStatus: "completed", advanced: true, },);
    });

    test("reports no advancement at the cap", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.QuestProgression,
          generated_cases: "[]",
        },
        makeCase({
          input: { questId, currentProgress: 100, },
          expected: { advanced: false, },
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("passed",);
      expect(r.actual,).toMatchObject({ advanced: false, newStatus: "completed", },);
    });

    test("fails on a status mismatch", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.QuestProgression,
          generated_cases: "[]",
        },
        makeCase({
          input: { questId, currentProgress: 5, },
          expected: { status: "completed", },
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("failed",);
    });

    test("skips when the quest is missing", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: SyntheticDataType.QuestProgression,
          generated_cases: "[]",
        },
        makeCase({
          input: { questId: "missing", },
          expected: {},
        },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("skipped",);
    });
  });

  // ── Dispatch fallback ───────────────────────────────────

  describe("executeCase dispatch", () => {
    test("skips unsupported scenario types", async () => {
      const r = await executeCase(
        makeState(),
        {
          id: rowId,
          chat_id: null,
          type: "UnknownType" as SyntheticDataType,
          generated_cases: "[]",
        },
        makeCase({ expected: {}, },),
        SyntheticTestMode.Replay,
      );
      expect(r.status,).toBe("skipped",);
      expect(r.reason,).toContain("unsupported scenario type",);
    });
  });

  // ── Run orchestration ───────────────────────────────────

  describe("run", () => {
    const qualityRowId = crypto.randomUUID();
    const regressionRowId = crypto.randomUUID();

    beforeAll(async () => {
      const caseJson = JSON.stringify([makeCase({ expected: { passed: true, }, },),],);
      await db.insertInto("synthetic_data",).values({
        id: qualityRowId,
        chat_id: null,
        world_id: worldId,
        type: SyntheticDataType.QualityEvaluation,
        source_data: "{}",
        generated_cases: caseJson,
        status: SyntheticDataStatus.Generated,
      },).execute();
      await db.insertInto("synthetic_data",).values({
        id: regressionRowId,
        chat_id: null,
        world_id: worldId,
        type: SyntheticDataType.QualityEvaluation,
        source_data: "{}",
        generated_cases: caseJson,
        status: SyntheticDataStatus.Generated,
      },).execute();
    },);

    test("replays all cases and aggregates counts", async () => {
      const runner = new SyntheticTestRunner({
        db,
        qualityEvaluator: alwaysPassEvaluator,
        idGenerator: () => "fixed-run-id",
      },);
      const result = await runner.run([qualityRowId,], SyntheticTestMode.Replay,);
      expect(result.runId,).toBe("fixed-run-id",);
      expect(result.total,).toBe(1,);
      expect(result.passed,).toBe(1,);
      expect(result.failed,).toBe(0,);
      expect(result.skipped,).toBe(0,);
      expect(result.summary.passRate,).toBe(1,);
    });

    test("auto-validates fully-passing rows in replay mode", async () => {
      const runner = new SyntheticTestRunner({
        db,
        qualityEvaluator: alwaysPassEvaluator,
        autoValidate: true,
      },);
      await runner.run([regressionRowId,], SyntheticTestMode.Replay,);
      const row = await db
        .selectFrom("synthetic_data",)
        .select("status",)
        .where("id", "=", regressionRowId,)
        .executeTakeFirst();
      expect(row?.status,).toBe(SyntheticDataStatus.Validated,);
    });

    test("produces suggested thresholds in calibration mode", async () => {
      const runner = new SyntheticTestRunner({ db, qualityEvaluator: alwaysPassEvaluator, },);
      const result = await runner.run([qualityRowId,], SyntheticTestMode.Calibration,);
      expect(result.summary.suggestedThresholds,).toBeDefined();
      expect(result.summary.suggestedThresholds,).toEqual({
        accept: expect.any(Number,),
        regenerate: expect.any(Number,),
        escalate: expect.any(Number,),
      },);
    });

    test("returns an empty result for no scenario ids", async () => {
      const runner = new SyntheticTestRunner({ db, qualityEvaluator: alwaysPassEvaluator, },);
      const result = await runner.run([], SyntheticTestMode.Replay,);
      expect(result.total,).toBe(0,);
      expect(result.summary.passRate,).toBe(0,);
    });
  });
});
