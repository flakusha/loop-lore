/**
 * Tests for provider-health cache service (scan, cache, summary helpers).
 */
import { afterAll, beforeAll, beforeEach, expect, mock, test, } from "bun:test";
import { createLogger, } from "../logger";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";

import {
  getHealthCache,
  getProviderHealth,
  getUnhealthyProviders,
  hasUnhealthyProviders,
  providerToSummary,
  resetHealthCache,
  scanAllProviders,
} from "./provider-health";

const healthyProvider = {
  name: "healthy-prov",
  capabilities: { label: "Healthy", supports: [], },
  healthCheck: async () => ({ status: "ok" as const, latencyMs: 12, }),
  listModels: async () => ["m1", "m2",],
} as never;

const sickProvider = {
  name: "sick-prov",
  capabilities: { label: "Sick", supports: [], },
  healthCheck: async () => ({ status: "down" as const, error: "boom", }),
  listModels: async () => [],
} as never;

const throwingProvider = {
  name: "throw-prov",
  capabilities: { label: "Throws", supports: [], },
  healthCheck: async () => {
    throw new Error("kaboom",);
  },
  listModels: async () => {
    throw new Error("models fail",);
  },
} as never;

if (ISOLATED) {
  mock.module("../generation/providers/registry", () => ({
    listProviders: () => [
      { name: "healthy-prov", capabilities: { label: "Healthy", supports: [], }, },
      { name: "sick-prov", capabilities: { label: "Sick", supports: [], }, },
      { name: "throw-prov", capabilities: { label: "Throws", supports: [], }, },
      { name: "ghost-prov", capabilities: { label: "Ghost", supports: [], }, },
    ],
    getProvider: (name: string,) => {
      if (name === "healthy-prov") { return healthyProvider; }
      if (name === "sick-prov") { return sickProvider; }
      if (name === "throw-prov") { return throwingProvider; }
      return;
    },
  }),);
}

describeOrSkip("provider-health", () => {
  beforeAll(() => {
    createLogger({ level: "warn", },);
  },);

  beforeEach(() => {
    resetHealthCache();
  },);

  afterAll(() => {
    resetHealthCache();
  },);

  describeOrSkip("scanAllProviders", () => {
    test("reports healthy, unreachable, error and missing providers", async () => {
      const results = await scanAllProviders();
      const byName = new Map(results.map(r => [r.name, r,]),);
      expect(results,).toHaveLength(4,);
      expect(byName.get("healthy-prov",)!.status,).toBe("healthy",);
      expect(byName.get("healthy-prov",)!.models,).toEqual(["m1" as never, "m2" as never,],);
      expect(byName.get("healthy-prov",)!.latencyMs,).toBe(12,);
      expect(byName.get("sick-prov",)!.status,).toBe("unreachable",);
      expect(byName.get("sick-prov",)!.error,).toBe("boom",);
      expect(byName.get("throw-prov",)!.status,).toBe("unreachable",);
      expect(byName.get("ghost-prov",)!.status,).toBe("error",);
      expect(byName.get("ghost-prov",)!.error,).toContain("Provider not found in registry",);
    });
  },);

  describeOrSkip("cache accessors", () => {
    beforeEach(async () => {
      await scanAllProviders();
    },);

    test("getHealthCache returns the last scan", async () => {
      const cache = getHealthCache();
      expect(cache,).toHaveLength(4,);
    });

    test("getProviderHealth finds provider by name", () => {
      expect(getProviderHealth("healthy-prov",)!.status,).toBe("healthy",);
      expect(getProviderHealth("nope",),).toBeUndefined();
    });

    test("hasUnhealthyProviders and getUnhealthyProviders", () => {
      expect(hasUnhealthyProviders(),).toBe(true,);
      const bad = getUnhealthyProviders();
      expect(bad,).not.toContain("healthy-prov",);
      expect(bad,).toContain("sick-prov",);
      expect(bad,).toContain("throw-prov",);
      expect(bad,).toContain("ghost-prov",);
    });
  },);

  describeOrSkip("providerToSummary", () => {
    test("serializes health status", () => {
      const summary = providerToSummary({
        name: "healthy-prov",
        label: "Healthy",
        status: "healthy",
        models: ["m1" as never,],
        latencyMs: 5,
        lastChecked: "t",
      },);
      expect(summary,).toEqual({
        name: "healthy-prov",
        label: "Healthy",
        status: "healthy",
        modelCount: 1,
        latencyMs: 5,
        error: undefined,
      },);
    });
  },);
},);
