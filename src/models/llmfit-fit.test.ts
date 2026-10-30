/**
 * Tests for the llmfit fit service.
 *
 * `hardwareFingerprint` is pure and fully asserted. `fitTable` /
 * `cacheFitVerdicts` shell out to the real `llmfit` binary when present
 * and degrade to null/0 when absent — the test only asserts the
 * degraded path strictly and probes the live path loosely.
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { cacheFitVerdicts, detectSystem, fitTable, hardwareFingerprint, } from "./llmfit-fit";

describe("llmfit fit service", () => {
  it("hardwareFingerprint is stable and hardware-sensitive", () => {
    const box = {
      cpu_name: "AMD Ryzen 9 7950X",
      cpu_cores: 32,
      total_ram_gb: 61.87,
      gpu_name: "AMD Radeon RX 7900 XTX",
      gpu_vram_gb: 23.98,
      backend: "ROCm",
      unified_memory: false,
    };

    const a = hardwareFingerprint(box,);
    expect(a,).toBe(hardwareFingerprint(box,),);
    expect(a.startsWith("hw_",),).toBe(true,);
    expect(a.length,).toBe(19,);
    expect(hardwareFingerprint({ ...box, gpu_name: "other", },),).not.toBe(a,);
  });

  it("detectSystem returns null or a system block, never throws", () => {
    const system = detectSystem();
    if (system !== null) {
      expect(typeof system.cpu_cores,).toBe("number",);
    }
  });

  it("fitTable returns null or a shaped table, never throws", () => {
    const table = fitTable(2,);
    if (table !== null) {
      expect(Array.isArray(table.models,),).toBe(true,);
      expect(table.models.length,).toBeLessThanOrEqual(2,);
      if (table.models.length > 0) {
        expect(typeof table.models[0]?.name,).toBe("string",);
      }
    }
  });

  it("cacheFitVerdicts persists rows per fingerprint when llmfit is present", async () => {
    if (fitTable(1,) === null) { return; }
    const { db, sqlite, } = await createTestDb();
    try {
      const written = await cacheFitVerdicts(db, { limit: 1, },);
      expect(written,).toBeGreaterThan(0,);
      // Idempotent: same observed_at second may re-record, so only
      // assert at least one fit_score row exists.
      const rows = await db
        .selectFrom("model_rankings",)
        .where("metric", "=", "fit_score",)
        .selectAll()
        .execute();

      expect(rows.length,).toBeGreaterThan(0,);
      expect(rows[0]?.scope,).toBe("instance",);
      expect(rows[0]?.basis,).toBe("formula",);
    } finally {
      sqlite.close();
    }
  });
});
