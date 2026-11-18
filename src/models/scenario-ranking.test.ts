// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { recordRanking, } from "./rankings";
import { recommendScenarioModel, SCENARIO_RANKINGS, } from "./scenario-ranking";

const row = (over: Record<string, unknown> = {},) => ({
  scope: "global",
  scopeKey: "",
  subjectKey: "hf:org/model-a",
  metric: "quality_score",
  value: 0.5,
  basis: "imported",
  source: "livebench",
  observedAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

describe("recommendScenarioModel", () => {
  it("picks the highest ranked candidate for the scenario metric", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await recordRanking(db, row(),);
      await recordRanking(db, row({ subjectKey: "hf:org/model-b", value: 0.9, },),);
      const result = await recommendScenarioModel(db, "general", ["model-a", "model-b",],);
      expect(result?.modelId,).toBe("model-b",);
      expect(result?.value,).toBe(0.9,);
      expect(result?.bypassed,).toBe(false,);
    } finally {
      sqlite.close();
    }
  });

  it("honors an explicit override as a ranking bypass", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await recordRanking(db, row({ value: 0.9, },),);
      const result = await recommendScenarioModel(db, "general", ["model-a",], {
        overrideModel: "model-a",
      },);

      expect(result,).toEqual({
        modelId: "model-a",
        metric: "quality_score",
        value: null,
        source: "override",
        bypassed: true,
      },);
    } finally {
      sqlite.close();
    }
  });

  it("ignores expired rows and unknown scenarios", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await recordRanking(db, row({ expiresAt: "2020-01-01T00:00:00.000Z", },),);
      expect(await recommendScenarioModel(db, "general", ["model-a",],),).toBeNull();
      expect(await recommendScenarioModel(db, "not-a-scenario", ["model-a",],),).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("publishes the known scenario-to-metric map", () => {
    expect(SCENARIO_RANKINGS.general.metric,).toBe("quality_score",);
    expect(Object.keys(SCENARIO_RANKINGS,),).toContain("chat",);
  });
});
