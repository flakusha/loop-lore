/**
 * Tests for the model rankings store (record, latest-wins, prune, snapshots).
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { latestRankings, pruneRankings, recordRanking, } from "./rankings";
import { freshSnapshot, storeSnapshot, } from "./snapshots";

const rec = (over: Record<string, unknown> = {},) => ({
  scope: "global",
  scopeKey: "",
  subjectKey: "hf:Qwen/Qwen3-4B|q4_k_m|ctx8192",
  metric: "quality_score",
  value: 0.81,
  unit: "score",
  basis: "imported",
  source: "livebench",
  observedAt: "2026-06-25T00:00:00.000Z",
  ...over,
});

describe("model rankings store", () => {
  it("records a row and is idempotent on re-ingest", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      expect(await recordRanking(db, rec(),),).toBe(true,);
      expect(await recordRanking(db, rec(),),).toBe(false,);
      const rows = await db.selectFrom("model_rankings",).selectAll().execute();
      expect(rows.length,).toBe(1,);
    } finally {
      sqlite.close();
    }
  });

  it("latestRankings returns newest observed_at per subject+metric", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await recordRanking(db, rec({ value: 0.7, observedAt: "2026-06-20T00:00:00.000Z", },),);
      await recordRanking(db, rec({ value: 0.81, observedAt: "2026-06-25T00:00:00.000Z", },),);
      const latest = await latestRankings(db, { metric: "quality_score", },);
      expect(latest.length,).toBe(1,);
      expect(latest[0]?.value,).toBe(0.81,);
    } finally {
      sqlite.close();
    }
  });

  it("pruneRankings keeps the current reading and drops superseded old measured rows", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const old = new Date(Date.now() - 200 * 86_400_000,).toISOString();
      const older = new Date(Date.now() - 210 * 86_400_000,).toISOString();
      await recordRanking(db, rec({ basis: "measured", source: "loop-lore", observedAt: older, },),);
      await recordRanking(db, rec({ basis: "measured", source: "loop-lore", observedAt: old, },),);
      await recordRanking(db, rec({ basis: "measured", source: "loop-lore", observedAt: new Date().toISOString(), },),);
      const deleted = await pruneRankings(db,);
      expect(deleted,).toBe(2,);
      const rows = await db.selectFrom("model_rankings",).selectAll().execute();
      expect(rows.length,).toBe(1,);
    } finally {
      sqlite.close();
    }
  });

  it("pruneRankings never touches imported rows", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const old = new Date(Date.now() - 200 * 86_400_000,).toISOString();
      await recordRanking(db, rec({ observedAt: old, },),);
      expect(await pruneRankings(db,),).toBe(0,);
    } finally {
      sqlite.close();
    }
  });

  it("snapshots: fresh payload wins, stale misses, version is idempotent", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const future = new Date(Date.now() + 86_400_000,).toISOString();
      const past = new Date(Date.now() - 86_400_000,).toISOString();
      expect(
        await storeSnapshot(db, {
          source: "ugi-csv",
          version: "v1",
          nextRefreshAfter: future,
          payload: "[1]",
        },),
      ).toBe(true,);

      expect(
        await storeSnapshot(db, {
          source: "ugi-csv",
          version: "v1",
          nextRefreshAfter: future,
          payload: "[1]",
        },),
      ).toBe(false,);

      expect(await freshSnapshot(db, "ugi-csv",),).toBe("[1]",);
      expect(await freshSnapshot(db, "other-source",),).toBeNull();
      await storeSnapshot(db, {
        source: "stale-src",
        version: "v1",
        nextRefreshAfter: past,
        payload: "[0]",
      },);

      expect(await freshSnapshot(db, "stale-src",),).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});
