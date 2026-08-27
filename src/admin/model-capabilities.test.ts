// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import type { ModelInfo, } from "../generation/providers/types";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  clearModelOverride,
  getContextWindowForModel,
  listModelCapabilities,
  resolveModelCapabilities,
  setModelOverride,
  upsertModelCapabilities,
} from "./model-capabilities";

/**
 * Build a mock ModelInfo with defaults for testing.
 * @param overrides - Partial fields to override defaults.
 * @returns A complete ModelInfo object.
 */
function makeModel(overrides: Partial<ModelInfo> = {},): ModelInfo {
  return {
    id: "gpt-4o",
    contextWindow: 128_000,
    maxOutput: 16_384,
    toolCalling: true,
    thinking: false,
    modalities: ["text", "image",],
    paramSize: undefined,
    ownedBy: "openai",
    ...overrides,
  };
}

describe("model-capabilities", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeEach(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
  },);

  afterEach(() => {
    sqlite.close();
  },);

  describe("upsertModelCapabilities", () => {
    test("inserts new model", async () => {
      await upsertModelCapabilities(db, "openai", [makeModel(),],);

      const caps = await resolveModelCapabilities(db, "openai", "gpt-4o",);
      expect(caps,).not.toBeNull();
      expect(caps!.contextWindow,).toBe(128_000,);
      expect(caps!.supportsTools,).toBe(true,);
      expect(caps!.supportsVision,).toBe(true,);
      expect(caps!.ownedBy,).toBe("openai",);
      expect(caps!.userOverride,).toBe(false,);
    });

    test("updates existing model", async () => {
      await upsertModelCapabilities(db, "openai", [makeModel(),],);
      await upsertModelCapabilities(db, "openai", [makeModel({ contextWindow: 256_000, },),],);

      const caps = await resolveModelCapabilities(db, "openai", "gpt-4o",);
      expect(caps!.contextWindow,).toBe(256_000,);
    });

    test("preserves user override on update", async () => {
      await upsertModelCapabilities(db, "openai", [makeModel(),],);
      await setModelOverride(db, "openai", "gpt-4o", { contextWindow: 999_999, },);
      await upsertModelCapabilities(db, "openai", [makeModel({ contextWindow: 256_000, },),],);

      const caps = await resolveModelCapabilities(db, "openai", "gpt-4o",);
      expect(caps!.contextWindow,).toBe(999_999,);
      expect(caps!.userOverride,).toBe(true,);
    });

    test("handles multiple models", async () => {
      await upsertModelCapabilities(db, "openai", [
        makeModel(),
        makeModel({ id: "gpt-4o-mini", contextWindow: 128_000, },),
      ],);

      const all = await listModelCapabilities(db, "openai",);
      expect(all.length,).toBe(2,);
    });
  });

  describe("resolveModelCapabilities", () => {
    test("returns null for unknown model", async () => {
      const caps = await resolveModelCapabilities(db, "openai", "unknown-model",);
      expect(caps,).toBeNull();
    });

    test("marks stale models", async () => {
      await upsertModelCapabilities(db, "openai", [makeModel(),],);

      // Manually set last_seen to 31 days ago
      await db
        .updateTable("model_capabilities",)
        .set({ last_seen: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000,).toISOString(), },)
        .where("model_id", "=", "gpt-4o",)
        .execute();

      const caps = await resolveModelCapabilities(db, "openai", "gpt-4o",);
      expect(caps!.isStale,).toBe(true,);
    });
  });

  describe("setModelOverride", () => {
    test("sets override fields", async () => {
      await upsertModelCapabilities(db, "openai", [makeModel(),],);

      const ok = await setModelOverride(db, "openai", "gpt-4o", {
        contextWindow: 999_999,
        notes: "Custom override",
      },);
      expect(ok,).toBe(true,);

      const caps = await resolveModelCapabilities(db, "openai", "gpt-4o",);
      expect(caps!.contextWindow,).toBe(999_999,);
      expect(caps!.notes,).toBe("Custom override",);
      expect(caps!.userOverride,).toBe(true,);
      // Other fields preserved
      expect(caps!.supportsTools,).toBe(true,);
    });

    test("returns false for unknown model", async () => {
      const ok = await setModelOverride(db, "openai", "unknown", { contextWindow: 100, },);
      expect(ok,).toBe(false,);
    });
  });

  describe("clearModelOverride", () => {
    test("reverts to auto-detected", async () => {
      await upsertModelCapabilities(db, "openai", [makeModel(),],);
      await setModelOverride(db, "openai", "gpt-4o", { contextWindow: 999_999, },);

      const ok = await clearModelOverride(db, "openai", "gpt-4o",);
      expect(ok,).toBe(true,);

      const caps = await resolveModelCapabilities(db, "openai", "gpt-4o",);
      expect(caps!.userOverride,).toBe(false,);
      // After clearing override, the value stays as-is until next provider scan
      // overwrites it. The flag is cleared so future scans will update it.
      expect(caps!.contextWindow,).toBe(999_999,);
    });
  });

  describe("listModelCapabilities", () => {
    test("filters by provider", async () => {
      await upsertModelCapabilities(db, "openai", [makeModel(),],);
      await upsertModelCapabilities(db, "ollama", [makeModel({ id: "llama3", },),],);

      const openai = await listModelCapabilities(db, "openai",);
      expect(openai.length,).toBe(1,);
      expect(openai[0]!.modelId,).toBe("gpt-4o",);

      const all = await listModelCapabilities(db,);
      expect(all.length,).toBe(2,);
    });
  });

  describe("getContextWindowForModel", () => {
    test("returns context window from registry", async () => {
      await upsertModelCapabilities(db, "openai", [makeModel(),],);

      const ctx = await getContextWindowForModel(db, "openai", "gpt-4o",);
      expect(ctx,).toBe(128_000,);
    });

    test("returns null for unknown model", async () => {
      const ctx = await getContextWindowForModel(db, "openai", "unknown",);
      expect(ctx,).toBeNull();
    });
  });
});
