/**
 * Provider Health Isolated Tests
 *
 * Runs the scan/cache contract under `--isolate` (the companion
 * provider-health.test.ts suite skips in that mode).
 */
import { beforeAll, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger/index.js";
import { createTestDb, } from "../test-utils/create-test-db";
import { describeOrSkipStrict, STRICTLY_ISOLATED, } from "../test-utils/isolate-only";
import {
  getHealthCache,
  getProviderHealth,
  getUnhealthyProviders,
  hasUnhealthyProviders,
  providerToSummary,
  resetHealthCache,
  scanAllProviders,
} from "./provider-health.js";

// mock.module is process-global in bun: without --isolate this stub replaces
// generation/providers/registry for every later test file (registerProvider
// writes the real Map while listProviders/getProvider read the stub), which
// breaks llm-config, test-connection, extraction, and caption suites in
// shared-process runs. Gate to the isolated canonical gate (`bun run
// test:unit` / `bun run check`); plain `bun test src/` skips this file.
//
// The stub is data-driven: edge tests swap the registry via `withRegistry`
// (getProvider throwing, all-healthy scans) without a second mock.module.
interface MockProviderEntry {
  name: string;
  label: string;
  provider?: {
    healthCheck: () => Promise<{ status: "ok" | "down"; latencyMs?: number; error?: string }>;
    listModels: () => Promise<unknown[]>;
  };
  /** When set, getProvider throws this value (Error or non-Error). */
  getProviderError?: unknown;
}

const DEFAULT_REGISTRY: MockProviderEntry[] = [
  {
    name: "healthy-prov",
    label: "Healthy",
    provider: {
      healthCheck: async () => ({ status: "ok" as const, latencyMs: 12, }),
      listModels: async () => [{ id: "m1", },],
    },
  },
  {
    name: "sick-prov",
    label: "Sick",
    provider: {
      healthCheck: async () => ({ status: "down" as const, error: "boom", }),
      listModels: async () => [],
    },
  },
  { name: "ghost-prov", label: "Ghost", },
];

const mockRegistry: MockProviderEntry[] = [...DEFAULT_REGISTRY,];

if (STRICTLY_ISOLATED) {
  mock.module("../generation/providers/registry.js", () => ({
    listProviders: () => mockRegistry.map((e,) => ({ name: e.name, capabilities: { label: e.label, supports: [], }, })),
    getProvider: (name: string,) => {
      const entry = mockRegistry.find((e,) => e.name === name);
      if (!entry) { return undefined; }
      if (entry.getProviderError !== undefined) { throw entry.getProviderError; }
      return entry.provider;
    },
  }),);
}

async function withRegistry(entries: MockProviderEntry[], fn: () => Promise<void>,): Promise<void> {
  const original = [...mockRegistry,];
  mockRegistry.length = 0;
  mockRegistry.push(...entries,);
  try {
    await fn();
  } finally {
    mockRegistry.length = 0;
    mockRegistry.push(...original,);
  }
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

  describe("scanAllProviders — registry failure edges", () => {
    test("classifies providers whose getProvider throws (Error and non-Error reasons)", async () => {
      await withRegistry(
        [
          ...DEFAULT_REGISTRY,
          { name: "explode-prov", label: "Explode", getProviderError: new Error("registry exploded",), },
          { name: "string-prov", label: "String", getProviderError: "plain string failure", },
        ],
        async () => {
          const results = await scanAllProviders();
          const byName = new Map(results.map((r,) => [r.name, r,]),);
          expect(byName.get("explode-prov",)?.status,).toBe("error",);
          expect(byName.get("explode-prov",)?.error,).toBe("registry exploded",);
          expect(byName.get("string-prov",)?.status,).toBe("error",);
          expect(byName.get("string-prov",)?.error,).toBe("Unknown error",);
          // A throwing provider must not sink its siblings.
          expect(byName.get("healthy-prov",)?.status,).toBe("healthy",);
        },
      );
    });

    test("all-healthy scan reports zero failures", async () => {
      await withRegistry([DEFAULT_REGISTRY[0]!,], async () => {
        const results = await scanAllProviders();
        expect(results,).toHaveLength(1,);
        expect(results[0]!.status,).toBe("healthy",);
        expect(hasUnhealthyProviders(),).toBe(false,);
        expect(getUnhealthyProviders(),).toEqual([],);
      },);
    });
  });

  describe("scanAllProviders — capabilities sync", () => {
    test("populates model_capabilities for healthy providers when db is provided", async () => {
      const { db, } = await createTestDb();
      try {
        const results = await scanAllProviders(db,);
        expect(results.find((r,) => r.name === "healthy-prov")?.status,).toBe("healthy",);
        const rows = await db.selectFrom("model_capabilities",).where("provider_id", "=", "healthy-prov",).selectAll()
          .execute();
        expect(rows.map((r,) => r.model_id),).toEqual(["m1",],);
        // Unhealthy/error providers must not populate the registry.
        const sickRows = await db.selectFrom("model_capabilities",).where("provider_id", "=", "sick-prov",).selectAll()
          .execute();
        expect(sickRows,).toHaveLength(0,);
      } finally {
        await db.destroy();
      }
    });

    test("scan still returns results when capabilities sync throws", async () => {
      const brokenDb = {
        selectFrom: () => {
          throw new Error("capabilities unavailable",);
        },
      } as unknown as Kysely<DB>;
      const results = await scanAllProviders(brokenDb,);
      expect(results.find((r,) => r.name === "healthy-prov")?.status,).toBe("healthy",);
      expect(getHealthCache().find((r,) => r.name === "healthy-prov")?.status,).toBe("healthy",);
    });
  });

  describe("cache accessors — empty cache", () => {
    test("return empty/false before any scan", () => {
      resetHealthCache();
      expect(getHealthCache(),).toEqual([],);
      expect(getProviderHealth("healthy-prov",),).toBeUndefined();
      expect(hasUnhealthyProviders(),).toBe(false,);
      expect(getUnhealthyProviders(),).toEqual([],);
    });
  });

  describe("providerToSummary — error shape", () => {
    test("serializes unreachable status with error and zero models", () => {
      const summary = providerToSummary({
        name: "sick-prov",
        label: "Sick",
        status: "unreachable",
        models: [],
        lastChecked: "t",
        error: "boom",
      } as never,);
      expect(summary,).toEqual({
        name: "sick-prov",
        label: "Sick",
        status: "unreachable",
        modelCount: 0,
        latencyMs: undefined,
        error: "boom",
      },);
    });
  });
},);
