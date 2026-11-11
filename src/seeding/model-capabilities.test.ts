// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the harness model-capability seed
 * (TASK-seed-codex-and-claude-model-capability-rows-for-harness-enri):
 * codex/* and claude/* rows land on a fresh db, re-seeding is idempotent,
 * admin overrides survive a re-seed, and — the pinning assertion — a
 * DISCOVERED namespaced id (`codex/…`, `claude/…`) enriches with non-null
 * capabilities once the seed has run.
 *
 * Resource contract (parallel-safe): per-file in-memory db fixture, runtime
 * reset around each test, in-memory adapter fakes. No ports, no sleeps.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import { resolveModelCapabilities, } from "../admin/model-capabilities";
import type { AcpProfileConfig, } from "../config/schema/harness";
import { fakeFactory, } from "../integrations/harness/fakes";
import { discoverHarnessModels, } from "../integrations/harness/model-discovery";
import { getHarnessRuntime, initHarnessRuntime, resetHarnessRuntime, } from "../integrations/harness/runtime";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { seedHarnessModelCapabilities, } from "./model-capabilities";

let fixture: TestDb;

beforeAll(async () => {
  fixture = await createTestDb();
},);

afterAll(async () => {
  await destroyTestDb(fixture,);
},);

beforeEach(async () => {
  resetHarnessRuntime();
  await fixture.db.deleteFrom("model_capabilities",).execute();
},);

afterEach(() => {
  resetHarnessRuntime();
},);

const CODEX_PROFILE: AcpProfileConfig = {
  name: "codex-p",
  command: ["fake", "codex-p",],
  harness: "codex",
  tiers: { fast: { model: "codex/gpt-5.1-codex", capabilities: ["tools",], }, },
};

const CLAUDE_PROFILE: AcpProfileConfig = {
  name: "claude-p",
  command: ["fake", "claude-p",],
  harness: "claude-code",
  tiers: { fast: { model: "claude/claude-opus-4-6", capabilities: ["tools",], }, },
};

describe("seedHarnessModelCapabilities", () => {
  it("seeds the codex and claude catalogs on a fresh db", async () => {
    const ensured = await seedHarnessModelCapabilities(fixture.db,);

    expect(ensured,).toBe(9,);
    const rows = await fixture.db.selectFrom("model_capabilities",).selectAll().execute();
    expect(rows.filter((r,) => r.provider_id === "codex"),).toHaveLength(3,);
    expect(rows.filter((r,) => r.provider_id === "claude"),).toHaveLength(6,);
  });

  it("enrichment facts land in the registry for both providers", async () => {
    await seedHarnessModelCapabilities(fixture.db,);

    const codex = await resolveModelCapabilities(fixture.db, "codex", "gpt-5.1-codex",);
    expect(codex,).not.toBeNull();
    expect(codex?.contextWindow,).toBe(400_000,);
    expect(codex?.maxOutput,).toBe(128_000,);
    expect(codex?.supportsTools,).toBe(true,);
    expect(codex?.supportsVision,).toBe(true,);
    expect(codex?.supportsThinking,).toBe(true,);

    const claude = await resolveModelCapabilities(fixture.db, "claude", "claude-sonnet-4-5",);
    expect(claude,).not.toBeNull();
    expect(claude?.contextWindow,).toBe(200_000,);
    expect(claude?.maxOutput,).toBe(64_000,);
  });

  it("is idempotent — re-seeding does not duplicate rows", async () => {
    await seedHarnessModelCapabilities(fixture.db,);
    await seedHarnessModelCapabilities(fixture.db,);

    const rows = await fixture.db.selectFrom("model_capabilities",).selectAll().execute();
    expect(rows,).toHaveLength(9,);
  });

  it("an admin override survives a re-seed", async () => {
    await seedHarnessModelCapabilities(fixture.db,);
    await fixture.db
      .updateTable("model_capabilities",)
      .set({ user_override: 1, context_window: 123, native_locale: "de", },)
      .where("provider_id", "=", "claude",)
      .where("model_id", "=", "claude-opus-4-6",)
      .execute();

    await seedHarnessModelCapabilities(fixture.db,);

    const row = await fixture.db
      .selectFrom("model_capabilities",)
      .selectAll()
      .where("provider_id", "=", "claude",)
      .where("model_id", "=", "claude-opus-4-6",)
      .executeTakeFirst();

    expect(row?.user_override,).toBe(1,);
    expect(row?.context_window,).toBe(123,);
    expect(row?.native_locale,).toBe("de",);
  });

  it("a discovered namespaced id enriches with non-null capabilities", async () => {
    await seedHarnessModelCapabilities(fixture.db,);
    const { factory, } = fakeFactory({
      "codex-p": { models: ["codex/gpt-5.1-codex",], },
      "claude-p": { models: ["claude/claude-opus-4-6",], },
    },);

    initHarnessRuntime({ enabled: true, profiles: [CODEX_PROFILE, CLAUDE_PROFILE,], }, factory,);
    await getHarnessRuntime()?.registry.ensureProbed("codex-p",);
    await getHarnessRuntime()?.registry.ensureProbed("claude-p",);

    const result = await discoverHarnessModels({ runtime: getHarnessRuntime()!, db: fixture.db, },);

    const codexEntry = result.find((p,) => p.profile === "codex-p")?.models[0];
    expect(codexEntry?.capabilities,).toEqual({
      contextWindow: 400_000,
      maxOutput: 128_000,
      supportsTools: true,
      supportsVision: true,
      supportsThinking: true,
      modalities: ["text", "image",],
    },);

    const claudeEntry = result.find((p,) => p.profile === "claude-p")?.models[0];
    expect(claudeEntry?.capabilities,).not.toBeNull();
    expect(claudeEntry?.capabilities?.contextWindow,).toBe(1_000_000,);
    expect(claudeEntry?.capabilities?.maxOutput,).toBe(128_000,);
  });
});
