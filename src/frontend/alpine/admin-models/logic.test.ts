// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { capabilitiesState, } from "./capabilities";
import { fineTuneState, } from "./fine-tune";
import { providerState, } from "./providers";
import { roleState, } from "./roles";
import type { FineTuneCandidate, ModelInfo, } from "./types";

function providerCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    modelRoleList: [],
    providerModels: {},
    ...overrides,
  };
}

describe("capabilitiesState.formatCtxWindow", () => {
  test("returns dash for null and undefined", () => {
    expect(capabilitiesState.formatCtxWindow!.call({}, null,),).toBe("-",);
    expect(capabilitiesState.formatCtxWindow!.call({}, undefined as unknown as null,),).toBe("-",);
  },);

  test("formats millions with one decimal", () => {
    expect(capabilitiesState.formatCtxWindow!.call({}, 1_000_000,),).toBe("1.0M",);
    expect(capabilitiesState.formatCtxWindow!.call({}, 2_500_000,),).toBe("2.5M",);
  },);

  test("formats thousands rounded", () => {
    expect(capabilitiesState.formatCtxWindow!.call({}, 1000,),).toBe("1K",);
    expect(capabilitiesState.formatCtxWindow!.call({}, 32_000,),).toBe("32K",);
    expect(capabilitiesState.formatCtxWindow!.call({}, 1500,),).toBe("2K",);
  },);

  test("returns raw string for small values", () => {
    expect(capabilitiesState.formatCtxWindow!.call({}, 0,),).toBe("0",);
    expect(capabilitiesState.formatCtxWindow!.call({}, 999,),).toBe("999",);
  },);
},);

describe("providerState pure helpers", () => {
  test("getProviderModels returns empty list for unknown provider", () => {
    const ctx = providerCtx({ providerModels: { openai: [{ id: "gpt-4", },], }, },);
    expect(providerState.getProviderModels!.call(ctx, "unknown",),).toEqual([],);
    expect(providerState.getProviderModels!.call(ctx, "openai",),).toEqual([{ id: "gpt-4", },],);
  },);

  test("getModelsForRole resolves via role list", () => {
    const models: ModelInfo[] = [{ id: "m1", },];
    const ctx = providerCtx({
      modelRoleList: [{ role: "chat", provider: "p1", model: "m1", },],
      providerModels: { p1: models, },
    },);
    expect(providerState.getModelsForRole!.call(ctx, "chat",),).toEqual(models,);
    expect(providerState.getModelsForRole!.call(ctx, "missing",),).toEqual([],);
    const ctxNoProvider = providerCtx({
      modelRoleList: [{ role: "chat", provider: "", model: "", },],
      providerModels: { p1: models, },
    },);
    expect(providerState.getModelsForRole!.call(ctxNoProvider, "chat",),).toEqual([],);
  },);

  test("getSelectedModel finds the bound model or undefined", () => {
    const models: ModelInfo[] = [{ id: "m1", }, { id: "m2", },];
    const ctx = providerCtx({
      modelRoleList: [{ role: "chat", provider: "p1", model: "m2", },],
      providerModels: { p1: models, },
    },);
    expect(providerState.getSelectedModel!.call(ctx, "chat",),).toEqual({ id: "m2", },);
    expect(providerState.getSelectedModel!.call(ctx, "other",),).toBeUndefined();
    const ctxEmpty = providerCtx({
      modelRoleList: [{ role: "chat", provider: "p1", model: "", },],
      providerModels: { p1: models, },
    },);
    expect(providerState.getSelectedModel!.call(ctxEmpty, "chat",),).toBeUndefined();
  },);

  test("modelSummary joins available parts", () => {
    expect(providerState.modelSummary!.call({}, undefined,),).toBe("",);
    expect(
      providerState.modelSummary!.call({}, {
        id: "m",
        paramSize: "8B",
        contextWindow: 32_000,
        thinking: true,
        toolCalling: true,
        modalities: ["text", "image",],
      },),
    ).toBe("8B · 32000 ctx · thinking · tools · text/image",);
    expect(providerState.modelSummary!.call({}, { id: "m", },),).toBe("",);
  },);

  test("modelSuitability flags lightweight, capable, and neutral", () => {
    // NOTE: paramSize parses strictly (whole-string number), so "8B"-style
    // sizes do NOT parse — size tiers only trigger on plain numeric strings.
    expect(providerState.modelSuitability!.call({}, undefined,),).toBe("",);
    expect(providerState.modelSuitability!.call({}, { id: "s", paramSize: "1", },),).toContain("Lightweight",);
    expect(providerState.modelSuitability!.call({}, { id: "s", contextWindow: 4096, },),).toContain("Lightweight",);
    expect(providerState.modelSuitability!.call({}, { id: "c", contextWindow: 64_000, },),).toContain("Capable",);
    expect(providerState.modelSuitability!.call({}, { id: "c", paramSize: "13", },),).toContain("Capable",);
    expect(providerState.modelSuitability!.call({}, { id: "n", paramSize: "7", },),).toBe("",);
    expect(providerState.modelSuitability!.call({}, { id: "b", paramSize: "8B", },),).toBe("",);
  },);

  test("modelSuitability handles unicode param sizes and missing data", () => {
    expect(providerState.modelSuitability!.call({}, { id: "u", paramSize: "7Ｂ", },),).toBe("",);
    expect(providerState.modelSuitability!.call({}, { id: "e", },),).toBe("",);
  },);
},);

describe("roleState.onRoleProviderChange", () => {
  test("clears the model when the provider changes", () => {
    const ctx = { modelRoleList: [{ role: "chat", provider: "p2", model: "m1", },], };
    roleState.onRoleProviderChange!.call(ctx, "chat",);
    expect(ctx.modelRoleList[0]!.model,).toBe("",);
  },);

  test("ignores unknown roles", () => {
    const ctx = { modelRoleList: [{ role: "chat", provider: "p1", model: "m1", },], };
    expect(() => roleState.onRoleProviderChange!.call(ctx, "missing",),).not.toThrow();
    expect(ctx.modelRoleList[0]!.model,).toBe("m1",);
  },);
},);

describe("fineTuneState", () => {
  test("trainingDispatchWired is false", () => {
    expect(fineTuneState.trainingDispatchWired,).toBe(false,);
  },);

  test("fineTuneCandidates merges discovered models and capability gaps", () => {
    const ctx = {
      providers: [{ name: "p1", }, { name: "p2", },],
      providerModels: { p1: [{ id: "m1", paramSize: "8", contextWindow: 32_000, },], },
      modelCapabilities: [
        {
          providerId: "p1",
          modelId: "m1",
          contextWindow: 32_000,
          maxOutput: 4096,
          supportsTools: true,
          supportsVision: false,
          supportsThinking: false,
          modalities: ["text",],
          paramSize: "8",
          ownedBy: "org",
          isStale: false,
          lastSeen: "t",
          userOverride: false,
          notes: null,
        },
        {
          providerId: "p2",
          modelId: "m2",
          contextWindow: null,
          maxOutput: null,
          supportsTools: false,
          supportsVision: false,
          supportsThinking: true,
          modalities: [],
          paramSize: null,
          ownedBy: null,
          isStale: false,
          lastSeen: "t",
          userOverride: false,
          notes: null,
        },
      ],
    };
    const out = fineTuneState.fineTuneCandidates!.call(ctx,);
    expect(out,).toHaveLength(2,);
    expect(out[0],).toMatchObject({ provider: "p1", model: "m1", paramSize: "8", },);
    expect(out[1],).toMatchObject({ provider: "p2", model: "m2", thinking: true, },);
    expect(out[0]!.provider,).toBe("p1",);
  },);

  test("fineTuneCandidates handles empty state and unicode ids", () => {
    const out = fineTuneState.fineTuneCandidates!.call({},);
    expect(out,).toEqual([],);
    const ctx = {
      providers: [{ name: "p-日本語", },],
      providerModels: { "p-日本語": [{ id: "モデル-α", },], },
      modelCapabilities: [],
    };
    const rows = fineTuneState.fineTuneCandidates!.call(ctx,);
    expect(rows,).toHaveLength(1,);
    expect(rows[0],).toMatchObject({ provider: "p-日本語", model: "モデル-α", },);
  },);

  test("fineTuneReadiness tiers by size and context", () => {
    const base: FineTuneCandidate = {
      provider: "p",
      model: "m",
      paramSize: null,
      contextWindow: null,
      maxOutput: null,
      modalities: [],
      thinking: false,
      toolCalling: false,
      ownedBy: null,
    };
    // Strict numeric parsing: plain "13" parses, "13B" does not.
    expect(fineTuneState.fineTuneReadiness!.call({}, { ...base, paramSize: "13", },),).toContain("large param",);
    expect(fineTuneState.fineTuneReadiness!.call({}, { ...base, contextWindow: 64_000, },),).toContain("large context",);
    expect(fineTuneState.fineTuneReadiness!.call({}, { ...base, paramSize: "7", },),).toContain("mid-size",);
    expect(fineTuneState.fineTuneReadiness!.call({}, base,),).toContain("prefer a larger model",);
  },);

  test("fineTuneReadiness tolerates malformed param sizes", () => {
    const base: FineTuneCandidate = {
      provider: "p",
      model: "m",
      paramSize: "huge",
      contextWindow: null,
      maxOutput: null,
      modalities: [],
      thinking: false,
      toolCalling: false,
      ownedBy: null,
    };
    expect(fineTuneState.fineTuneReadiness!.call({}, base,),).toContain("prefer a larger model",);
    expect(
      fineTuneState.fineTuneReadiness!.call({}, { ...base, paramSize: "13B", contextWindow: 64_000, },),
    ).toContain("large context",);
  },);
},);
