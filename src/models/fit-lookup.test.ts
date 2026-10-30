/**
 * Tests for the admin fit lookup (fuzzy match, null on miss).
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { fitForModels, } from "./fit-lookup";
import { recordRanking, } from "./rankings";

const observedAt = "2026-06-25T00:00:00.000Z";

describe("fit lookup", () => {
  it("matches llmfit subject keys to provider model ids, null on miss", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await recordRanking(db, {
        scope: "instance",
        scopeKey: "hw_abc",
        subjectKey: "llmfit:Qwen/Qwen3-8B-GGUF|ctx8192",
        metric: "fit_score",
        value: 0.9,
        unit: "score",
        basis: "formula",
        source: "llmfit",
        observedAt,
        meta: { fit_level: "Perfect", estimated_tps: 40, estimate_confidence: "estimated", },
      },);

      const out = await fitForModels(db, ["qwen3-8b", "unknown-model-xyz",],);
      const hit = out.get("qwen3-8b",);
      expect(hit?.score,).toBe(0.9,);
      expect(hit?.fitLevel,).toBe("Perfect",);
      expect(hit?.estimatedTps,).toBe(40,);
      expect(hit?.fingerprint,).toBe("hw_abc",);
      expect(out.get("unknown-model-xyz",),).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});
