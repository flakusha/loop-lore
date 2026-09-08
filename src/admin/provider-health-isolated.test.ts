/**
 * Provider Health Isolated Tests
 *
 * Runs the scan/cache contract under `--isolate` (the companion
 * provider-health.test.ts suite skips in that mode).
 */
import { beforeAll, expect, mock, test, } from "bun:test";
import { createLogger, } from "../logger/index.js";
import { describeOrSkipStrict, STRICTLY_ISOLATED, } from "../test-utils/isolate-only";
import {
  getHealthCache,
  getProviderHealth,
  getUnhealthyProviders,
  hasUnhealthyProviders,
  providerToSummary,
  scanAllProviders,
} from "./provider-health.js";

// mock.module is process-global in bun: without --isolate this stub replaces
// generation/providers/registry for every later test file (registerProvider
// writes the real Map while listProviders/getProvider read the stub), which
// breaks llm-config, test-connection, extraction, and caption suites in
// shared-process runs. Gate to the isolated canonical gate (`bun run
// test:unit` / `bun run check`); plain `bun test src/` skips this file.
if (STRICTLY_ISOLATED) {
  mock.module("../generation/providers/registry.js", () => ({
    listProviders: () => [
      { name: "healthy-prov", capabilities: { label: "Healthy", supports: [], }, },
      { name: "sick-prov", capabilities: { label: "Sick", supports: [], }, },
      { name: "ghost-prov", capabilities: { label: "Ghost", supports: [], }, },
    ],
    getProvider: (name: string,) => {
      if (name === "healthy-prov") {
        return {
          healthCheck: async () => ({ status: "ok" as const, latencyMs: 12, }),
          listModels: async () => [{ id: "m1", },],
        };
      }
      if (name === "sick-prov") {
        return {
          healthCheck: async () => ({ status: "down" as const, error: "boom", }),
          listModels: async () => [],
        };
      }
      return undefined;
    },
  }),);
}

describeOrSkipStrict("provider-health (isolated)", () => {
  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  test("scan classifies healthy, unreachable, and missing providers", async () => {
    const results = await scanAllProviders();
    const byName = new Map(results.map((r,) => [r.name, r,]),);
    expect(results,).toHaveLength(3,);
    expect(byName.get("healthy-prov",)?.status,).toBe("healthy",);
    expect(byName.get("healthy-prov",)?.latencyMs,).toBe(12,);
    expect(byName.get("sick-prov",)?.status,).toBe("unreachable",);
    expect(byName.get("sick-prov",)?.error,).toBe("boom",);
    expect(byName.get("ghost-prov",)?.status,).toBe("error",);
  });

  test("cache accessors reflect the last scan", async () => {
    await scanAllProviders();
    expect(getHealthCache(),).toHaveLength(3,);
    expect(getProviderHealth("healthy-prov",)?.status,).toBe("healthy",);
    expect(getProviderHealth("nope",),).toBeUndefined();
    expect(hasUnhealthyProviders(),).toBe(true,);
    expect(getUnhealthyProviders(),).toEqual(["sick-prov", "ghost-prov",],);
  });

  test("providerToSummary serializes counts", () => {
    const summary = providerToSummary({
      name: "h",
      label: "H",
      status: "healthy",
      models: [{ id: "m1", },],
      lastChecked: "t",
    } as never,);
    expect(summary,).toMatchObject({ name: "h", status: "healthy", modelCount: 1, },);
  });
},);
