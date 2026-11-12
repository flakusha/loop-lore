// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/image-engine/comfyui-setup.ts — the ComfyUI setup
 * store.
 *
 * Asserts: input validation rejects bad names/URLs/purposes/workflows/
 * defaults without storing anything, the save/list/delete round-trip keeps
 * key material out of descriptors, a stored API key is sealed at rest (with
 * an active SMK), malformed rows parse as null, the provider conversion keeps
 * the apiFamily and pinned workflow, the merge behavior the generation path
 * relies on, and sdcpp rows never leak into the comfyui family views.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { ImageProviderConfig, } from "../../config/schema";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  comfyUIDescriptorKey,
  comfyUISecretKey,
  comfyUISetupToProviderConfig,
  deleteComfyUISetup,
  listComfyUISetups,
  listStoredComfyUIProviders,
  mergeComfyUISetups,
  parseStoredComfyUISetup,
  saveComfyUISetup,
  SdSetupValidationError,
} from "./comfyui-setup";
import { saveSdCppSetup, sdCppDescriptorKey, } from "./sdcpp-setup";

const VALID_BASE = "http://127.0.0.1:8188";

const VALID_INPUT = {
  name: "local-comfy",
  label: "Local ComfyUI",
  baseUrl: VALID_BASE,
} as const;

describe("ComfyUI setup store", () => {
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
    ["schemeless baseUrl", { ...VALID_INPUT, baseUrl: "127.0.0.1:8188", },],
    ["metadata-target baseUrl", { ...VALID_INPUT, baseUrl: "http://169.254.169.254/latest", },],
    ["bad purpose", { ...VALID_INPUT, purpose: "sometimes" as "both", },],
    ["empty workflow", { ...VALID_INPUT, workflow: "", },],
    ["over-long workflow", { ...VALID_INPUT, workflow: "w".repeat(201,), },],
    ["zero steps", { ...VALID_INPUT, defaults: { steps: 0, }, },],
    ["negative width", { ...VALID_INPUT, defaults: { width: -5, }, },],
    ["fractional height", { ...VALID_INPUT, defaults: { height: 51.5, }, },],
    ["non-positive cfgScale", { ...VALID_INPUT, defaults: { cfgScale: 0, }, },],
    ["empty sampler", { ...VALID_INPUT, defaults: { sampler: "", }, },],
    ["empty negativePrompt", { ...VALID_INPUT, defaults: { negativePrompt: "", }, },],
  ],)("rejects invalid input: %s", async (_label, input,) => {
    await expect(saveComfyUISetup(db, input,),).rejects.toThrow(SdSetupValidationError,);
    // Nothing is stored on a rejection.
    expect(await listComfyUISetups(db,),).toEqual([],);
  },);

  test("save + list round-trip normalizes label, purpose and defaults", async () => {
    const saved = await saveComfyUISetup(db, {
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

    const list = await listComfyUISetups(db,);
    expect(list,).toHaveLength(1,);
    expect(list[0],).toEqual(saved,);
  });

  test("a pinned workflow round-trips through the descriptor", async () => {
    await saveComfyUISetup(db, { ...VALID_INPUT, workflow: "txt2img", },);

    const list = await listComfyUISetups(db,);
    expect(list[0]!.workflow,).toBe("txt2img",);
  });

  test("a stored API key is sealed at rest and only surfaces as hasApiKey", async () => {
    await saveComfyUISetup(db, { ...VALID_INPUT, apiKey: "secret-proxy-key", },);

    const raw = await db
      .selectFrom("system_config",)
      .select("value",)
      .where("key", "=", comfyUISecretKey(VALID_INPUT.name,),)
      .executeTakeFirst();

    expect(raw?.value,).toBeDefined();
    expect(raw!.value,).not.toContain("secret-proxy-key",);

    const list = await listComfyUISetups(db,);
    expect(list,).toHaveLength(1,);
    expect(list[0]!.hasApiKey,).toBe(true,);
    expect(JSON.stringify(list,),).not.toContain("secret-proxy-key",);
  });

  test("an empty apiKey clears a stored key; an omitted one keeps it", async () => {
    await saveComfyUISetup(db, { ...VALID_INPUT, apiKey: "first-key", },);
    await saveComfyUISetup(db, { ...VALID_INPUT, },);
    expect((await listComfyUISetups(db,))[0]!.hasApiKey,).toBe(true,);

    await saveComfyUISetup(db, { ...VALID_INPUT, apiKey: "", },);
    expect((await listComfyUISetups(db,))[0]!.hasApiKey,).toBe(false,);
  });

  test("delete removes both rows and rejects unknown names", async () => {
    await saveComfyUISetup(db, { ...VALID_INPUT, apiKey: "k", },);
    await deleteComfyUISetup(db, VALID_INPUT.name,);
    expect(await listComfyUISetups(db,),).toEqual([],);

    await expect(deleteComfyUISetup(db, "ghost",),).rejects.toThrow(SdSetupValidationError,);
  });

  test("sdcpp rows never leak into the comfyui family views", async () => {
    await saveSdCppSetup(db, { name: "sd-instance", baseUrl: "http://127.0.0.1:9010", },);
    await saveComfyUISetup(db, { ...VALID_INPUT, },);

    const comfyList = await listComfyUISetups(db,);
    expect(comfyList,).toHaveLength(1,);
    expect(comfyList[0]!.name,).toBe(VALID_INPUT.name,);

    const comfyProviders = await listStoredComfyUIProviders(db,);
    expect(comfyProviders,).toHaveLength(1,);
    expect(comfyProviders[0]!.apiFamily,).toBe("comfyui",);

    // The descriptor lives under the comfyui prefix only.
    const rows = await db.selectFrom("system_config",).selectAll().execute();
    expect(rows.map((row,) => row.key),).toContain(comfyUIDescriptorKey(VALID_INPUT.name,),);
    expect(rows.map((row,) => row.key),).toContain(sdCppDescriptorKey("sd-instance",),);
  });

  test("parseStoredComfyUISetup rejects malformed rows", () => {
    expect(parseStoredComfyUISetup("not json",),).toBeNull();
    expect(parseStoredComfyUISetup(JSON.stringify({ name: 7, },),),).toBeNull();
    expect(parseStoredComfyUISetup(JSON.stringify({ name: "a", label: "a", baseUrl: "u", purpose: "edit", },),),)
      .toBeNull();
  });

  test("comfyUISetupToProviderConfig produces a comfyui provider with the workflow", () => {
    const provider = comfyUISetupToProviderConfig({
      name: "stored-one",
      label: "Stored One",
      baseUrl: VALID_BASE,
      purpose: "generate",
      workflow: "qwen-image-edit",
      defaults: { width: 640, height: 640, steps: 30, cfgScale: 5, sampler: "euler_a", },
    },);

    expect(provider.apiFamily,).toBe("comfyui",);
    expect(provider.purpose,).toBe("generate",);
    expect(provider.workflow,).toBe("qwen-image-edit",);
    expect(provider.timeout,).toBeGreaterThan(0,);
    expect(provider.generationTimeout,).toBeGreaterThan(0,);
  });

  test("comfyUISetupToProviderConfig omits an absent workflow", () => {
    const provider = comfyUISetupToProviderConfig({
      name: "bare",
      label: "Bare",
      baseUrl: VALID_BASE,
      purpose: "both",
      defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
    },);

    expect("workflow" in provider,).toBe(false,);
  });

  test("listStoredComfyUIProviders skips malformed rows", async () => {
    await saveComfyUISetup(db, VALID_INPUT,);
    await saveComfyUISetup(db, { name: "broken", baseUrl: VALID_BASE, },);
    await db
      .updateTable("system_config",)
      .set({ value: "corrupted", },)
      .where("key", "=", comfyUIDescriptorKey("broken",),)
      .execute();

    const providers = await listStoredComfyUIProviders(db,);
    expect(providers,).toHaveLength(1,);
    expect(providers[0]!.name,).toBe(VALID_INPUT.name,);
  });

  test("mergeComfyUISetups replaces same-name entries and appends the rest", () => {
    const stored = comfyUISetupToProviderConfig({
      name: "shared",
      label: "Stored override",
      baseUrl: VALID_BASE,
      purpose: "both",
      defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
    },);

    const storedNew = comfyUISetupToProviderConfig({
      name: "extra",
      label: "Extra",
      baseUrl: VALID_BASE,
      purpose: "both",
      defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
    },);

    const fileSd: ImageProviderConfig = {
      name: "sd-file",
      label: "sd-file",
      baseUrl: "http://127.0.0.1:9010",
      apiFamily: "sdcpp",
      defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
      timeout: 30_000,
      generationTimeout: 120_000,
    };

    const merged = mergeComfyUISetups([fileSd, { ...fileSd, name: "shared", apiFamily: "comfyui", },], [
      stored,
      storedNew,
    ],);

    expect(merged,).toHaveLength(3,);
    expect(merged[0],).toBe(fileSd,);
    expect(merged[1],).toBe(stored,);
    expect(merged[2],).toBe(storedNew,);
  });

  test("mergeComfyUISetups handles undefined configured lists", () => {
    const stored = [comfyUISetupToProviderConfig({
      name: "only",
      label: "Only",
      baseUrl: VALID_BASE,
      purpose: "both",
      defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
    },),];

    expect(mergeComfyUISetups(undefined, stored,),).toEqual(stored,);
    expect(mergeComfyUISetups([], [],),).toEqual([],);
  });
});
