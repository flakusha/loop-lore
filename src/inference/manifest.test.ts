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
  isWllamaEngine,
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

  test("manifest lists per-file downloads with direct URLs", () => {
    const manifest = buildLocalInferenceManifest();
    expect(manifest.version,).toBe(1,);
    expect(manifest.eligibleTasks,).toEqual(["prompt-improve", "prompt-analyze",],);
    expect(manifest.models.length,).toBeGreaterThan(0,);
    for (const model of BROWSER_MODEL_CATALOG) {
      if (!isWllamaEngine(model.engine,)) {
        expect(model.files.length,).toBeGreaterThan(0,);
      }
      for (const file of model.files) {
        expect(file.name.length,).toBeGreaterThan(0,);
        expect(file.url.startsWith("https://",),).toBe(true,);
        if (file.sizeBytes !== undefined) {
          expect(Number.isSafeInteger(file.sizeBytes,),).toBe(true,);
          expect(file.sizeBytes,).toBeGreaterThan(0,);
        }
        if (file.sha256 !== undefined) {
          expect(/^[0-9a-f]{64}$/.test(file.sha256,),).toBe(true,);
        }
      }
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
    const restIds = BROWSER_MODEL_CATALOG.map((model,) => model.id).filter((id,) => id !== first.id);
    const denyOne = { models: { [first.id]: { allowDownload: false, }, }, };
    expect(isModelDownloadable(first.id, denyOne,),).toBe(false,);
    expect(isModelDownloadable(second.id, denyOne,),).toBe(true,);
    expect(buildLocalInferenceManifest(denyOne,).models.map((model,) => model.id),).toEqual(restIds,);
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

  test("isWllamaEngine splits wllama GGUF entries from transformers.js ones", () => {
    expect(isWllamaEngine("wllama-webgpu",),).toBe(true,);
    expect(isWllamaEngine("wllama-wasm",),).toBe(true,);
    expect(isWllamaEngine("transformers-webgpu",),).toBe(false,);
    expect(isWllamaEngine("transformers-wasm",),).toBe(false,);
    expect(isWllamaEngine("",),).toBe(false,);
  });

  test("wllama entries carry a GGUF source; transformers.js entries carry none", () => {
    for (const model of BROWSER_MODEL_CATALOG) {
      if (isWllamaEngine(model.engine,)) {
        expect(model.gguf?.repo.length,).toBeGreaterThan(0,);
        expect(model.gguf?.file.endsWith(".gguf",),).toBe(true,);
      } else {
        expect(model.gguf,).toBeUndefined();
      }
    }
    expect(BROWSER_MODEL_CATALOG.some((model,) => isWllamaEngine(model.engine,)),).toBe(true,);
  });
});
