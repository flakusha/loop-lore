// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the four new board importers — parse plus stubbed
 * import, idempotency, and failed-fetch behaviour. No network.
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { importHallucinations, parseHallucinationsTree, } from "./boards-hallucinations";
import { importLiveBench, parseLiveBenchCsv, } from "./boards-livebench";
import { aggregateLiveCodeBench, importLiveCodeBench, } from "./boards-livecodebench";
import { importLmarena, parseLmarenaPage, } from "./boards-lmarena";
import { latestRankings, } from "./rankings";

function stubFetch(body: string,) {
  return async (_url: string,) => new Response(body, { status: 200, },);
}

const LIVEBENCH_CSV = [
  "model,math_comp,python,summarize",
  "model-a,90,80,70",
  "model-b,50,,30",
  "bad-row,NaN,NaN,NaN",
].join("\n",);

describe("livebench board import", () => {
  it("means the numeric task columns and skips garbage rows", () => {
    const rows = parseLiveBenchCsv(LIVEBENCH_CSV, "2026-06-25",);
    expect(rows.length,).toBe(2,);
    expect(rows[0],).toMatchObject({ modelId: "model-a", mean: 80, tasks: 3, },);
    expect(rows[1]?.mean,).toBe(40,);
  });

  it("persists one imported row per model per release", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const written = await importLiveBench(db, stubFetch(LIVEBENCH_CSV,) as typeof fetch,);
      expect(written,).toBeGreaterThan(0,);
      expect(await importLiveBench(db, stubFetch(LIVEBENCH_CSV,) as typeof fetch,),).toBe(0,);
      const rows = await latestRankings(db, { scope: "global", source: "livebench", },);
      expect(rows.length,).toBeGreaterThan(0,);
    } finally {
      sqlite.close();
    }
  });
});

describe("livecodebench board import", () => {
  it("newest-wins per question, then means by model", () => {
    const rows = aggregateLiveCodeBench([
      { model: "m", question_id: "q1", "pass@1": 50, date: 1000, },
      { model: "m", question_id: "q1", "pass@1": 100, date: 2000, },
      { model: "m", question_id: "q2", "pass@1": 0, date: 1500, },
    ],);

    expect(rows.length,).toBe(1,);
    expect(rows[0],).toMatchObject({ model: "m", meanPassAt1: 50, questions: 2, },);
  });

  it("persists one pass_at_1 row per model", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const body = JSON.stringify({
        performances: [
          { model: "m", question_id: "q1", "pass@1": 100, date: 1_700_000_000_000, },
        ],
      },);

      expect(await importLiveCodeBench(db, stubFetch(body,) as typeof fetch,),).toBe(1,);
      expect(await importLiveCodeBench(db, stubFetch(body,) as typeof fetch,),).toBe(0,);
    } finally {
      sqlite.close();
    }
  });
});

describe("hallucinations board import", () => {
  it("extracts newest run per model from the tree listing", () => {
    const tree = JSON.stringify([
      { path: "org/model/results_2024-09-19 01:30:30.746008.json", },
      { path: "org/model/results_2024-10-28 17:58:12.108008.json", },
      { path: "other/model/results_2024-10-01 06:21:18.json", },
    ],);

    const runs = parseHallucinationsTree(tree,);
    expect(runs.length,).toBe(3,);
  });

  it("persists one row per model for its newest run", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const tree = JSON.stringify([
        { path: "org/model/results_2024-09-19 01:30:30.746008.json", },
        { path: "org/model/results_2024-10-28 17:58:12.108008.json", },
      ],);

      expect(await importHallucinations(db, stubFetch(tree,) as typeof fetch,),).toBe(1,);
      const rows = await latestRankings(db, { scope: "global", source: "hallucinations-leaderboard", },);
      expect(rows.length,).toBe(1,);
    } finally {
      sqlite.close();
    }
  });
});

describe("lmarena board import", () => {
  it("keeps overall rows and drops other categories", () => {
    const page = JSON.stringify({
      num_rows_total: 2,
      rows: [
        {
          row: {
            model_name: "m-a",
            rating: 1400,
            rank: 1,
            vote_count: 10,
            category: "overall",
            leaderboard_publish_date: "2026-10-28",
          },
        },
        {
          row: {
            model_name: "m-a",
            rating: 1390,
            rank: 2,
            vote_count: 5,
            category: "coding",
            leaderboard_publish_date: "2026-10-28",
          },
        },
      ],
    },);

    expect(parseLmarenaPage(page,).length,).toBe(1,);
  });

  it("persists one arena_score row per model and pages once on short pages", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const page = JSON.stringify({
        num_rows_total: 1,
        rows: [
          {
            row: {
              model_name: "m-a",
              rating: 1400,
              rank: 1,
              vote_count: 10,
              category: "overall",
              leaderboard_publish_date: "2026-10-28",
            },
          },
        ],
      },);

      expect(await importLmarena(db, stubFetch(page,) as typeof fetch,),).toBe(1,);
      expect(await importLmarena(db, stubFetch(page,) as typeof fetch,),).toBe(0,);
    } finally {
      sqlite.close();
    }
  });
});
