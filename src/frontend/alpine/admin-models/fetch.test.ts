// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "../i18n.test-helper";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { capabilitiesState, } from "./capabilities";
import { pluginState, } from "./plugins";
import { providerState, } from "./providers";
import { roleState, } from "./roles";
import { sdState, } from "./sd";

// All five sub-states use the ambient `apiFetch` global (no htmx import), so
// stub globalThis directly and restore afterwards — never mock.module i18n.
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
const g = globalThis as unknown as { apiFetch?: ApiFetchMock; showToast?: (...args: unknown[]) => void };
const originalFetch = g.apiFetch;
const originalToast = g.showToast;

let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let toasts: { type: string; message: string }[] = [];

function mockFetch(status: number, body: unknown = {},): void {
  handler = async () => Response.json(body, { status, },);
}

beforeEach(() => {
  calls = [];
  toasts = [];
  handler = async () => Response.json({},);
  g.apiFetch = (url, opts,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  };
  g.showToast = (type, message,) => {
    toasts.push({ type: type as string, message: message as string, },);
  };
},);

afterEach(() => {
  g.apiFetch = originalFetch;
  g.showToast = originalToast;
},);

describe("capabilitiesState fetch", () => {
  test("loadModelCapabilities stores rows and clears loading", async () => {
    mockFetch(200, { capabilities: [{ providerId: "p", modelId: "m", },], },);
    const ctx = { ...capabilitiesState, modelCapabilities: [], loadingCapabilities: false, capabilityFilter: "", };
    await capabilitiesState.loadModelCapabilities!.call(ctx,);
    expect(ctx.modelCapabilities,).toHaveLength(1,);
    expect(ctx.loadingCapabilities,).toBe(false,);
    expect(calls[0]!.url,).toBe("/api/admin/model-capabilities",);
  },);

  test("loadModelCapabilities appends provider filter and keeps stale data on error", async () => {
    mockFetch(200, { capabilities: [], },);
    const ctx = {
      ...capabilitiesState,
      modelCapabilities: [{ providerId: "old", modelId: "m", },],
      loadingCapabilities: false,
      capabilityFilter: "p1",
    };
    await capabilitiesState.loadModelCapabilities!.call(ctx,);
    expect(calls[0]!.url,).toBe("/api/admin/model-capabilities?provider=p1",);
    expect(ctx.modelCapabilities,).toEqual([],);
    // A network error keeps whatever rows are already present (stale data).
    const stale = {
      ...capabilitiesState,
      modelCapabilities: [{ providerId: "old", modelId: "m", },],
      loadingCapabilities: false,
      capabilityFilter: "",
    };
    handler = async () => {
      throw new Error("offline",);
    };
    await capabilitiesState.loadModelCapabilities!.call(stale,);
    expect(stale.modelCapabilities,).toHaveLength(1,);
    expect(stale.modelCapabilities[0],).toMatchObject({ providerId: "old", },);
    expect(stale.loadingCapabilities,).toBe(false,);
  },);

  test("saveCapabilityOverride reloads on success and toasts errors", async () => {
    let n = 0;
    handler = async (url,) => {
      n++;
      if (url.includes("/api/admin/model-capabilities/p/m",) && n === 1) {
        return Response.json({ ok: true, }, { status: 200, },);
      }
      return Response.json({ capabilities: [], }, { status: 200, },);
    };
    const ctx = { ...capabilitiesState, loadModelCapabilities: capabilitiesState.loadModelCapabilities, };
    await capabilitiesState.saveCapabilityOverride!.call(ctx, "p", "m", { notes: "x", },);
    expect(toasts[0]?.type,).toBe("success",);
    mockFetch(500, {},);
    await capabilitiesState.saveCapabilityOverride!.call(ctx, "p", "m", {},);
    expect(toasts[toasts.length - 1]?.type,).toBe("error",);
  },);

  test("clearCapabilityOverride toasts network errors", async () => {
    handler = async () => {
      throw new Error("offline",);
    };
    const ctx = { ...capabilitiesState, };
    await capabilitiesState.clearCapabilityOverride!.call(ctx, "p", "m",);
    expect(toasts[0]?.type,).toBe("error",);
  },);
},);

describe("providerState fetch", () => {
  test("loadModels fans out per provider", async () => {
    handler = async (url,) => {
      if (url === "/api/admin/providers") {
        return Response.json({ providers: [{ name: "p1", }, { name: "p2", },], },);
      }
      return Response.json({ models: [{ id: `${url}-m`, },], },);
    };
    const ctx = { ...providerState, providers: [], providerModels: {}, loadingModels: false, };
    await providerState.loadModels!.call(ctx,);
    expect(ctx.providers,).toHaveLength(2,);
    expect((ctx.providerModels as Record<string, { id: string }[]>)["p1"],).toHaveLength(1,);
    expect(ctx.loadingModels,).toBe(false,);
  },);

  test("loadProviderModels keeps stale data on network error", async () => {
    handler = async () => {
      throw new Error("offline",);
    };
    const ctx = { ...providerState, providerModels: {}, };
    await expect(providerState.loadProviderModels!.call(ctx, "p1",),).resolves.toBeUndefined();
    expect((ctx.providerModels as Record<string, unknown>)["p1"],).toBeUndefined();
  },);

  test("rescanProviders merges status and rescans models", async () => {
    handler = async (url,) => {
      if (url === "/api/admin/providers/rescan") {
        return Response.json({ providers: [{ name: "p1", status: "up", modelCount: 3, },], },);
      }
      return Response.json({ models: [], },);
    };
    const ctx = {
      ...providerState,
      providers: [{ name: "p1", label: "P1", capabilities: {}, status: "down", modelCount: 0, },],
      providerModels: {},
      scanning: false,
    };
    await providerState.rescanProviders!.call(ctx,);
    expect(ctx.providers[0],).toMatchObject({ name: "p1", status: "up", modelCount: 3, },);
    expect(ctx.scanning,).toBe(false,);
    expect(toasts[0]?.type,).toBe("success",);
  },);

  test("rescanProviders toasts on failure", async () => {
    mockFetch(500, {},);
    const ctx = { ...providerState, providers: [], providerModels: {}, scanning: true, };
    await providerState.rescanProviders!.call(ctx,);
    expect(ctx.scanning,).toBe(false,);
    expect(toasts[0]?.type,).toBe("error",);
  },);
},);

describe("roleState fetch", () => {
  test("loadModelRoles builds a stable list plus tuning strings", async () => {
    mockFetch(200, {
      roles: [{ role: "chat", provider: "p1", model: "m1", source: "db", },],
      overrides: { chat: { provider: "p1", model: "m1", temperature: 0.5, maxTokens: null, }, },
      validRoles: ["chat", "caption",],
    },);
    const ctx = { ...roleState, modelRoleList: [], overrides: {}, roleTuning: {}, };
    await roleState.loadModelRoles!.call(ctx,);
    expect(ctx.modelRoleList,).toEqual([
      { role: "chat", provider: "p1", model: "m1", },
      { role: "caption", provider: "", model: "", },
    ] as never,);
    expect((ctx.roleTuning as Record<string, unknown>)["chat"],).toEqual({ temperature: "0.5", maxTokens: "", },);
  },);

  test("saveModelRole skips when provider or model missing", async () => {
    const ctx = { ...roleState, modelRoleList: [{ role: "chat", provider: "", model: "", },], roleTuning: {}, };
    await roleState.saveModelRole!.call(ctx, "chat",);
    expect(calls,).toHaveLength(0,);
  },);

  test("saveModelRole PUTs tuning with null for blanks", async () => {
    mockFetch(200, {},);
    const ctx = {
      ...roleState,
      modelRoleList: [{ role: "chat", provider: "p1", model: "m1", },],
      roleTuning: { chat: { temperature: "", maxTokens: "100", }, },
      loadModelRoles: async () => {},
    };
    await roleState.saveModelRole!.call(ctx, "chat",);
    expect(calls[0]!.url,).toBe("/api/admin/model-roles/chat",);
    expect(JSON.parse(calls[0]!.opts.body as string,),).toMatchObject({
      provider: "p1",
      model: "m1",
      temperature: null,
      maxTokens: 100,
    },);
  },);

  test("clearModelRole reloads on success", async () => {
    mockFetch(200, {},);
    let reloaded = 0;
    const ctx = { ...roleState, loadModelRoles: async () => { reloaded++; }, };
    await roleState.clearModelRole!.call(ctx, "chat",);
    expect(reloaded,).toBe(1,);
    expect(toasts[0]?.type,).toBe("success",);
  },);
},);

describe("pluginState fetch", () => {
  test("loadPlugins stores the list and clears loading", async () => {
    mockFetch(200, [{ name: "pl", },],);
    const ctx = { ...pluginState, pluginList: [], loadingPlugins: false, };
    await pluginState.loadPlugins!.call(ctx,);
    expect(ctx.pluginList,).toHaveLength(1,);
    expect(ctx.loadingPlugins,).toBe(false,);
  },);

  test("togglePlugin reloads on success", async () => {
    mockFetch(200, {},);
    let reloaded = 0;
    const ctx = { ...pluginState, loadPlugins: async () => { reloaded++; }, };
    await pluginState.togglePlugin!.call(ctx, "pl", true,);
    expect(calls[0]!.url,).toBe("/api/plugins/pl/enable",);
    expect(reloaded,).toBe(1,);
  },);

  test("togglePlugin toasts server errors", async () => {
    mockFetch(400, { message: "nope", },);
    const ctx = { ...pluginState, loadPlugins: async () => {}, };
    await pluginState.togglePlugin!.call(ctx, "pl", false,);
    expect(toasts[0]?.type,).toBe("error",);
  },);
},);

describe("sdState fetch", () => {
  test("loadSdStatus stores running state", async () => {
    mockFetch(200, { status: "running", port: 9011, latencyMs: 12, },);
    const ctx = { ...sdState, sdStatus: "unknown", sdPort: 9010, sdLatencyMs: null as number | null, };
    await sdState.loadSdStatus!.call(ctx,);
    expect(ctx.sdStatus,).toBe("running",);
    expect(ctx.sdPort,).toBe(9011,);
    expect(ctx.sdLatencyMs,).toBe(12,);
  },);

  test("loadSdStatus falls back to unknown on network error", async () => {
    handler = async () => {
      throw new Error("offline",);
    };
    const ctx = { ...sdState, sdStatus: "running", };
    await sdState.loadSdStatus!.call(ctx,);
    expect(ctx.sdStatus,).toBe("unknown",);
  },);

  test("loadSdConfig maps every known key and ignores unknown keys", async () => {
    mockFetch(200, [
      { key: "sd_server_port", value: "9012", },
      { key: "sd_model_type", value: "lora", },
      { key: "sd_llm_path", value: "/models/llm", },
      { key: "sd_enabled", value: "false", },
      { key: "comfyui_url", value: "http://x:8188", },
      { key: "comfyui_enabled", value: "true", },
      { key: "unknown_key", value: "zzz", },
    ],);
    const ctx = {
      ...sdState,
      sdConfig: { enabled: true, port: 9010, modelPath: "", modelType: "checkpoint", llmPath: "", preferredBackend: "sd-server", },
      comfyuiConfig: { url: "http://localhost:8188", enabled: false, },
    };
    await sdState.loadSdConfig!.call(ctx,);
    expect(ctx.sdConfig.port,).toBe(9012,);
    expect(ctx.sdConfig.modelType,).toBe("lora",);
    expect(ctx.sdConfig.llmPath,).toBe("/models/llm",);
    expect(ctx.sdConfig.enabled,).toBe(false,);
    expect(ctx.comfyuiConfig.url,).toBe("http://x:8188",);
    expect(ctx.comfyuiConfig.enabled,).toBe(true,);
  },);

  test("loadSdConfig tolerates malformed port values", async () => {
    mockFetch(200, [{ key: "sd_server_port", value: "not-a-port", },],);
    const ctx = {
      ...sdState,
      sdConfig: { enabled: true, port: 9010, modelPath: "", modelType: "c", llmPath: "", preferredBackend: "b", },
      comfyuiConfig: { url: "u", enabled: false, },
    };
    await sdState.loadSdConfig!.call(ctx,);
    expect(ctx.sdConfig.port,).toBe(9010,);
  },);

  test("saveSdConfig PATCHes seven entries", async () => {
    mockFetch(200, {},);
    const ctx = {
      ...sdState,
      sdConfig: { enabled: true, port: 9010, modelPath: "/m", modelType: "checkpoint", llmPath: "", preferredBackend: "b", },
      comfyuiConfig: { url: "http://localhost:8188", enabled: false, },
    };
    await sdState.saveSdConfig!.call(ctx,);
    expect(calls,).toHaveLength(7,);
    expect(JSON.parse(calls[0]!.opts.body as string,),).toMatchObject({ key: "sd_enabled", },);
  },);
},);
