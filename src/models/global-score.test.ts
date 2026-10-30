/**
 * Tests for the global board score lookup (fuzzy match, null on miss).
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { globalScoresForModels, } from "./global-score";
import { recordRanking, } from "./rankings";

describe("global score lookup", () => {
  it("matches board subject keys to provider model ids, null on miss", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await recordRanking(db, {
        scope: "global",
        scopeKey: "",
        subjectKey: "hf:mistralai/Mistral-Small-3.1-24B-Instruct-2503",
        metric: "quality_score",
        value: 40.94,
        unit: "score",
        basis: "imported",
        source: "ugi",
        observedAt: "2025-09-06T00:00:00.000Z",
      },);

      const out = await globalScoresForModels(db, ["mistral-small-3.1-24b", "unknown-model-xyz",],);
      const hit = out.get("mistral-small-3.1-24b",);
      expect(hit?.value,).toBe(40.94,);
      expect(hit?.source,).toBe("ugi",);
      expect(out.get("unknown-model-xyz",),).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});
