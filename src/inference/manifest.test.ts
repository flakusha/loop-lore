// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  BROWSER_MODEL_CATALOG,
  buildLocalInferenceManifest,
  ELIGIBLE_LOCAL_TASKS,
  isEligibleLocalTask,
  isLocalOnlyLevel,
  isModelDownloadable,
} from "./manifest";

describe("local inference manifest", () => {
  test("eligible tasks cover only auxiliary work, never main generation", () => {
    expect([...ELIGIBLE_LOCAL_TASKS,],).toEqual(["prompt-improve", "prompt-analyze",],);
    expect(isEligibleLocalTask("prompt-improve",),).toBe(true,);
    expect(isEligibleLocalTask("generate",),).toBe(false,);
    expect(isEligibleLocalTask("",),).toBe(false,);
  });

  test("spellcheck runs locally without a model download", () => {
    expect(isLocalOnlyLevel("spellcheck",),).toBe(true,);
    expect(isLocalOnlyLevel("creative",),).toBe(false,);
    expect(isLocalOnlyLevel("style-chat",),).toBe(false,);
  });

  test("manifest is versioned and lists small models only", () => {
    const manifest = buildLocalInferenceManifest();
    expect(manifest.version,).toBe(1,);
    expect(manifest.eligibleTasks,).toEqual(["prompt-improve", "prompt-analyze",],);
    expect(manifest.models.length,).toBeGreaterThan(0,);
    for (const model of BROWSER_MODEL_CATALOG) {
      expect(model.approxSizeMB,).toBeLessThanOrEqual(500,);
      expect(model.cdn.startsWith("https://",),).toBe(true,);
    }
  });
  test("absent policy allows every catalog model", () => {
    for (const model of BROWSER_MODEL_CATALOG) {
      expect(isModelDownloadable(model.id,),).toBe(true,);
    }
    expect(buildLocalInferenceManifest().models.length,).toBe(BROWSER_MODEL_CATALOG.length,);
  });

  test("admin default deny blocks all models", () => {
    const policy = { allowDownloads: false, };
    for (const model of BROWSER_MODEL_CATALOG) {
      expect(isModelDownloadable(model.id, policy,),).toBe(false,);
    }
    expect(buildLocalInferenceManifest(policy,).models,).toEqual([],);
  });

  test("per-model config wins over the admin default either way", () => {
    const first = BROWSER_MODEL_CATALOG[0];
    const second = BROWSER_MODEL_CATALOG[1];
    if (!first || !second) { throw new Error("policy test needs two catalog models",); }
    const denyOne = { models: { [first.id]: { allowDownload: false, }, }, };
    expect(isModelDownloadable(first.id, denyOne,),).toBe(false,);
    expect(isModelDownloadable(second.id, denyOne,),).toBe(true,);
    expect(buildLocalInferenceManifest(denyOne,).models.map((model,) => model.id),).toEqual([
      second.id,
    ],);
    const allowOne = { allowDownloads: false, models: { [second.id]: { allowDownload: true, }, }, };
    expect(isModelDownloadable(first.id, allowOne,),).toBe(false,);
    expect(isModelDownloadable(second.id, allowOne,),).toBe(true,);
    expect(buildLocalInferenceManifest(allowOne,).models.map((model,) => model.id),).toEqual([
      second.id,
    ],);
  });

  test("unknown model ids in policy are ignored", () => {
    const policy = { models: { "no-such-model": { allowDownload: false, }, }, };
    expect(buildLocalInferenceManifest(policy,).models.length,).toBe(BROWSER_MODEL_CATALOG.length,);
  });
});
