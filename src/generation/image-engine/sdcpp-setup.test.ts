// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/image-engine/sdcpp-setup.ts — the sd.cpp setup store.
 *
 * Asserts: input validation rejects bad names/URLs/purposes/defaults without
 * storing anything, the save/list/delete round-trip keeps key material out of
 * descriptors, a stored API key is sealed at rest (with an active SMK),
 * malformed rows parse as null, and the provider conversion + merge behavior
 * the generation path relies on.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { ImageProviderConfig, } from "../../config/schema";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  deleteSdSetup,
  listSdSetups,
  listStoredSdSetupProviders,
  mergeSdSetups,
  parseStoredSdSetup,
  saveSdSetup,
  sdDescriptorKey,
  sdSecretKey,
  sdStoredSetupToProviderConfig,
} from "./sd-setup-store";
import {
  assertDefaultField,
  assertValidSetupInput,
  SD_SETUP_DEFAULTS,
  SD_SETUP_GENERATION_TIMEOUT_MS,
  SD_SETUP_NAME_PATTERN,
  SD_SETUP_TIMEOUT_MS,
} from "./sd-setup-validation";
import {
  deleteSdCppSetup,
  listSdCppSetups,
  listStoredSdCppProviders,
  mergeSdCppSetups,
  parseStoredSdCppSetup,
  saveSdCppSetup,
  sdCppDescriptorKey,
  sdCppSecretKey,
  sdCppSetupToProviderConfig,
  SdCppSetupValidationError,
} from "./sdcpp-setup";

const VALID_BASE = "http://127.0.0.1:9010";

const VALID_INPUT = {
  name: "local-sdcpp",
  label: "Local sd.cpp",
  baseUrl: VALID_BASE,
} as const;

const configProvider = (name: string,): ImageProviderConfig => ({
  name,
  label: name,
  baseUrl: "http://127.0.0.1:8188",
  apiFamily: "comfyui",
  defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
  timeout: 30_000,
  generationTimeout: 120_000,
});

describe("sd.cpp setup store", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    // Active SMK so the sealed-key storage path has key material.
    await initSmk({
      serverEncryptionKey: "f".repeat(64,),
      required: false,
      compressThreshold: 1024,
      compressAlgorithm: "gzip",
    },);
  },);

  afterAll(async () => {
    // Reset the process-global SMK so later suites do not inherit an active key.
    await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
    await db.destroy();
  },);

  beforeEach(async () => {
    await db.deleteFrom("system_config",).execute();
  },);

  test.each([
    ["blank name", { ...VALID_INPUT, name: "", },],
    ["name starting with punctuation", { ...VALID_INPUT, name: "-bad", },],
    ["over-long name", { ...VALID_INPUT, name: "a".repeat(65,), },],
    ["blank baseUrl", { ...VALID_INPUT, baseUrl: "", },],
    ["non-URL baseUrl", { ...VALID_INPUT, baseUrl: "not-a-url", },],
    ["schemeless baseUrl", { ...VALID_INPUT, baseUrl: "127.0.0.1:9010", },],
    ["metadata-target baseUrl", { ...VALID_INPUT, baseUrl: "http://169.254.169.254/latest", },],
    ["bad purpose", { ...VALID_INPUT, purpose: "sometimes" as "both", },],
    ["zero steps", { ...VALID_INPUT, defaults: { steps: 0, }, },],
    ["negative width", { ...VALID_INPUT, defaults: { width: -5, }, },],
    ["fractional height", { ...VALID_INPUT, defaults: { height: 51.5, }, },],
    ["non-positive cfgScale", { ...VALID_INPUT, defaults: { cfgScale: 0, }, },],
    ["empty sampler", { ...VALID_INPUT, defaults: { sampler: "", }, },],
    ["empty negativePrompt", { ...VALID_INPUT, defaults: { negativePrompt: "", }, },],
  ],)("rejects invalid input: %s", async (_label, input,) => {
    await expect(saveSdCppSetup(db, input,),).rejects.toThrow(SdCppSetupValidationError,);
    // Nothing is stored on a rejection.
    expect(await listSdCppSetups(db,),).toEqual([],);
  },);

  test("save + list round-trip normalizes label, purpose and defaults", async () => {
    const saved = await saveSdCppSetup(db, {
      name: "minimal",
      baseUrl: VALID_BASE,
      defaults: { steps: 25, },
    },);

    expect(saved.name,).toBe("minimal",);
    expect(saved.label,).toBe("minimal",);
    expect(saved.purpose,).toBe("both",);
    expect(saved.defaults.steps,).toBe(25,);
    expect(saved.defaults.width,).toBe(512,);
    expect(saved.defaults.sampler,).toBe("euler",);
    expect(saved.hasApiKey,).toBe(false,);
    expect("apiKey" in saved,).toBe(false,);

    const list = await listSdCppSetups(db,);
    expect(list,).toHaveLength(1,);
    expect(list[0],).toEqual(saved,);
  });

  test("a stored API key is sealed at rest and only surfaces as hasApiKey", async () => {
    await saveSdCppSetup(db, { ...VALID_INPUT, apiKey: "secret-proxy-key", },);

    const raw = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", sdCppSecretKey(VALID_INPUT.name,),)
      .executeTakeFirst();

    expect(raw?.value,).toBeDefined();
    expect(raw!.value,).not.toContain("secret-proxy-key",);

    const list = await listSdCppSetups(db,);
    expect(list,).toHaveLength(1,);
    expect(list[0]!.hasApiKey,).toBe(true,);
    expect(JSON.stringify(list,),).not.toContain("secret-proxy-key",);
  });

  test("an empty apiKey clears a stored key; an omitted one keeps it", async () => {
    await saveSdCppSetup(db, { ...VALID_INPUT, apiKey: "first-key", },);
    await saveSdCppSetup(db, { ...VALID_INPUT, },);
    expect((await listSdCppSetups(db,))[0]!.hasApiKey,).toBe(true,);

    await saveSdCppSetup(db, { ...VALID_INPUT, apiKey: "", },);
    expect((await listSdCppSetups(db,))[0]!.hasApiKey,).toBe(false,);
  });

  test("delete removes both rows and rejects unknown names", async () => {
    await saveSdCppSetup(db, { ...VALID_INPUT, apiKey: "k", },);
    await deleteSdCppSetup(db, VALID_INPUT.name,);
    expect(await listSdCppSetups(db,),).toEqual([],);

    await expect(deleteSdCppSetup(db, "ghost",),).rejects.toThrow(SdCppSetupValidationError,);
  });

  test("SQL-shaped names never reach a query as anything but a rejected literal", async () => {
    const hostile = "a'; DROP TABLE system_config;--";

    // save: the slug-name validation rejects the payload before any key is built.
    await expect(saveSdCppSetup(db, { ...VALID_INPUT, name: hostile, },),).rejects.toThrow(
      SdCppSetupValidationError,
    );

    // delete: the hostile name is bound as an equality parameter (no match) —
    // the table survives and stays empty.
    await expect(deleteSdCppSetup(db, hostile,),).rejects.toThrow(SdCppSetupValidationError,);

    const rows = await db.selectFrom("system_config",).selectAll().execute();
    expect(rows,).toEqual([],);
  });

  test("parseStoredSdCppSetup rejects malformed rows", () => {
    expect(parseStoredSdCppSetup("not json",),).toBeNull();
    expect(parseStoredSdCppSetup(JSON.stringify({ name: 7, },),),).toBeNull();
    expect(parseStoredSdCppSetup(JSON.stringify({ name: "a", label: "a", baseUrl: "u", purpose: "edit", },),),)
      .toBeNull();
  });

  test("sdCppSetupToProviderConfig produces an sdcpp provider", () => {
    const provider = sdCppSetupToProviderConfig({
      name: "stored-one",
      label: "Stored One",
      baseUrl: VALID_BASE,
      purpose: "generate",
      defaults: { width: 640, height: 640, steps: 30, cfgScale: 5, sampler: "euler_a", },
    },);

    expect(provider.apiFamily,).toBe("sdcpp",);
    expect(provider.purpose,).toBe("generate",);
    expect(provider.timeout,).toBeGreaterThan(0,);
    expect(provider.generationTimeout,).toBeGreaterThan(0,);
  });

  test("listStoredSdCppProviders skips malformed rows", async () => {
    await saveSdCppSetup(db, VALID_INPUT,);
    await saveSdCppSetup(db, { name: "broken", baseUrl: VALID_BASE, },);
    await db
      .updateTable("system_config",)
      .set({ value: "corrupted", },)
      .where("key", "=", sdCppDescriptorKey("broken",),)
      .execute();

    const providers = await listStoredSdCppProviders(db,);
    expect(providers,).toHaveLength(1,);
    expect(providers[0]!.name,).toBe(VALID_INPUT.name,);
  });

  test("mergeSdCppSetups replaces same-name entries and appends the rest", () => {
    const storedA = sdCppSetupToProviderConfig({
      name: "shared",
      label: "Stored override",
      baseUrl: VALID_BASE,
      purpose: "both",
      defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
    },);

    const storedNew = sdCppSetupToProviderConfig({
      name: "extra",
      label: "Extra",
      baseUrl: VALID_BASE,
      purpose: "both",
      defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
    },);

    const fileComfy = configProvider("comfy-main",);

    const merged = mergeSdCppSetups([fileComfy, { ...fileComfy, name: "shared", apiFamily: "sdcpp", },], [
      storedA,
      storedNew,
    ],);

    expect(merged,).toHaveLength(3,);
    expect(merged[0],).toBe(fileComfy,);
    expect(merged[1],).toBe(storedA,);
    expect(merged[2],).toBe(storedNew,);
  });

  test("mergeSdCppSetups handles undefined configured lists", () => {
    const stored = [sdCppSetupToProviderConfig({
      name: "only",
      label: "Only",
      baseUrl: VALID_BASE,
      purpose: "both",
      defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
    },),];

    expect(mergeSdCppSetups(undefined, stored,),).toEqual(stored,);
    expect(mergeSdCppSetups([], [],),).toEqual([],);
  });

  test("shared engine entry points serve the sdcpp family identically", async () => {
    const saved = await saveSdSetup(db, "sdcpp", { ...VALID_INPUT, },);
    expect(saved.name,).toBe(VALID_INPUT.name,);
    expect(await listSdSetups(db, "sdcpp",),).toEqual(await listSdCppSetups(db,),);
    expect(sdDescriptorKey("sdcpp", "n",),).toBe(sdCppDescriptorKey("n",),);
    expect(sdSecretKey("sdcpp", "n",),).toBe(sdCppSecretKey("n",),);
    expect(await listStoredSdSetupProviders(db, "sdcpp",),).toEqual(await listStoredSdCppProviders(db,),);
    expect(mergeSdSetups(undefined, await listStoredSdSetupProviders(db, "sdcpp",),),)
      .toEqual(mergeSdCppSetups(undefined, await listStoredSdCppProviders(db,),),);

    expect(parseStoredSdSetup(JSON.stringify({
      name: "a",
      label: "a",
      baseUrl: VALID_BASE,
      purpose: "both",
      defaults: { width: 1, height: 1, steps: 1, cfgScale: 1, sampler: "s", },
    },),),).toEqual(parseStoredSdCppSetup(JSON.stringify({
      name: "a",
      label: "a",
      baseUrl: VALID_BASE,
      purpose: "both",
      defaults: { width: 1, height: 1, steps: 1, cfgScale: 1, sampler: "s", },
    },),),);

    expect(sdStoredSetupToProviderConfig("sdcpp", {
      name: "a",
      label: "a",
      baseUrl: VALID_BASE,
      purpose: "both",
      defaults: { width: 1, height: 1, steps: 1, cfgScale: 1, sampler: "s", },
    },),).toEqual(sdCppSetupToProviderConfig({
      name: "a",
      label: "a",
      baseUrl: VALID_BASE,
      purpose: "both",
      defaults: { width: 1, height: 1, steps: 1, cfgScale: 1, sampler: "s", },
    },),);

    await deleteSdSetup(db, "sdcpp", VALID_INPUT.name,);
    expect(await listSdCppSetups(db,),).toEqual([],);
  });

  test("validation constants pin the boot auto-discovery shape", () => {
    expect(SD_SETUP_TIMEOUT_MS,).toBe(30_000,);
    expect(SD_SETUP_GENERATION_TIMEOUT_MS,).toBe(120_000,);
    expect(SD_SETUP_DEFAULTS.steps,).toBe(20,);
  });

  test("validation primitives reject out-of-range operator input", () => {
    expect(SD_SETUP_NAME_PATTERN.test("ok-name.1",),).toBe(true,);
    expect(SD_SETUP_NAME_PATTERN.test("-bad",),).toBe(false,);
    expect(assertDefaultField("steps", 3,),).toBe(3,);
    expect(() => assertDefaultField("steps", 0,)).toThrow(SdCppSetupValidationError,);
    expect(() => assertValidSetupInput({ name: "bad name!", baseUrl: VALID_BASE, },))
      .toThrow(SdCppSetupValidationError,);
  });
});
