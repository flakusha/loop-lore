// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { adminLora, } from "./admin-lora";
import type { LoraModelView, } from "./admin-lora";

// ── Mock ../htmx (must override the real one set by htmx.ts at import) ──
interface Call {
  url: string;
  opts?: RequestInit;
}

const calls: Call[] = [];
const responses = new Map<string, () => Response>();

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      calls.push({ url, opts, },);
      const handler = responses.get(url.split("?",)[0]!,);
      if (!handler) { return new Response("{}", { status: 200, },); }
      return handler();
    },
  }),);
}

const MODEL: LoraModelView = {
  name: "ink_style",
  filename: "ink_style.safetensors",
  path: "/models/loras/ink_style.safetensors",
  backend: "sd-server",
  size: 1_500_000_000,
  triggerWords: ["ink style",],
  recommendedStrength: 0.6,
};

function resetState(): void {
  adminLora.loraStatus = null;
  adminLora.loraModels = [];
  adminLora.loraCount = 0;
  adminLora.loraSearch = "";
  adminLora.loraBackend = "";
  adminLora.loraLoading = false;
  adminLora.loraDiscovering = false;
  adminLora.loraError = "";
  adminLora.loraMessage = "";
  calls.length = 0;
  responses.clear();
}

describeOrSkip("adminLora.loadLora", () => {
  afterEach(resetState,);

  test("loads status and list", async () => {
    responses.set("/api/v1/lora/status", () => Response.json({ entries: 2, nextExpiration: 42, },),);
    responses.set("/api/v1/lora/list", () => Response.json({ ok: true, count: 1, models: [MODEL,], },),);

    await adminLora.loadLora();

    expect(adminLora.loraStatus,).toEqual({ entries: 2, nextExpiration: 42, },);
    expect(adminLora.loraModels,).toEqual([MODEL,],);
    expect(adminLora.loraCount,).toBe(1,);
    expect(adminLora.loraError,).toBe("",);
    expect(adminLora.loraLoading,).toBe(false,);
  });

  test("passes backend and search filters as query params", async () => {
    responses.set("/api/v1/lora/status", () => Response.json({ entries: 0, nextExpiration: null, },),);
    responses.set("/api/v1/lora/list", () => Response.json({ ok: true, count: 0, models: [], },),);
    adminLora.loraBackend = "comfyui";
    adminLora.loraSearch = " ink ";

    await adminLora.loadLora();

    expect(calls[1]?.url,).toBe("/api/v1/lora/list?backend=comfyui&search=ink",);
  });

  test("surfaces an error when either endpoint fails", async () => {
    responses.set("/api/v1/lora/status", () => Response.json({ entries: 0, nextExpiration: null, },),);
    responses.set("/api/v1/lora/list", () => new Response("{}", { status: 403, },),);

    await adminLora.loadLora();

    expect(adminLora.loraError,).toBe("admin.lora.loadFailed",);
    expect(adminLora.loraModels,).toEqual([],);
    expect(adminLora.loraStatus,).toBeNull();
  });
},);

describeOrSkip("adminLora.discoverLora", () => {
  afterEach(resetState,);

  test("POSTs all-backends discovery and reloads", async () => {
    responses.set("/api/v1/lora/discover", () => Response.json({ ok: true, models: [MODEL,], },),);
    responses.set("/api/v1/lora/status", () => Response.json({ entries: 1, nextExpiration: 1, },),);
    responses.set("/api/v1/lora/list", () => Response.json({ ok: true, count: 1, models: [MODEL,], },),);

    await adminLora.discoverLora();

    expect(calls[0]?.opts?.method,).toBe("POST",);
    expect(JSON.parse(String(calls[0]?.opts?.body,),),).toEqual({ forceRefresh: true, },);
    expect(adminLora.loraMessage,).toBe("admin.lora.discoverDone",);
    expect(adminLora.loraError,).toBe("",);
    expect(adminLora.loraModels,).toHaveLength(1,);
    expect(adminLora.loraDiscovering,).toBe(false,);
  });

  test("scopes discovery to the selected backend", async () => {
    responses.set("/api/v1/lora/discover", () => Response.json({ ok: true, models: [], },),);
    responses.set("/api/v1/lora/status", () => Response.json({ entries: 0, nextExpiration: null, },),);
    responses.set("/api/v1/lora/list", () => Response.json({ ok: true, count: 0, models: [], },),);
    adminLora.loraBackend = "sd-server";

    await adminLora.discoverLora();

    expect(JSON.parse(String(calls[0]?.opts?.body,),),).toEqual({ backend: "sd-server", forceRefresh: true, },);
  });

  test("surfaces per-backend errors from the payload", async () => {
    responses.set("/api/v1/lora/discover", () => Response.json({ ok: false, errors: ["comfyui unreachable",], },),);
    responses.set("/api/v1/lora/status", () => Response.json({ entries: 0, nextExpiration: null, },),);
    responses.set("/api/v1/lora/list", () => Response.json({ ok: true, count: 0, models: [], },),);

    await adminLora.discoverLora();

    expect(adminLora.loraError,).toBe("comfyui unreachable",);
  });

  test("surfaces the forbidden error on 403", async () => {
    responses.set("/api/v1/lora/discover", () => Response.json({ error: "Forbidden", }, { status: 403, },),);

    await adminLora.discoverLora();

    expect(adminLora.loraError,).toBe("Forbidden",);
    expect(adminLora.loraDiscovering,).toBe(false,);
  });
},);

describeOrSkip("adminLora.clearLoraCache and loraSizeLabel", () => {
  afterEach(resetState,);

  test("POSTs clear without a backend by default", async () => {
    responses.set("/api/v1/lora/clear", () => Response.json({ ok: true, cleared: "all", },),);
    responses.set("/api/v1/lora/status", () => Response.json({ entries: 0, nextExpiration: null, },),);
    responses.set("/api/v1/lora/list", () => Response.json({ ok: true, count: 0, models: [], },),);

    await adminLora.clearLoraCache();

    expect(JSON.parse(String(calls[0]?.opts?.body,),),).toEqual({},);
    expect(adminLora.loraMessage,).toBe("admin.lora.clearDone",);
  });

  test("labels byte sizes in GB and MB", () => {
    expect(adminLora.loraSizeLabel({ ...MODEL, size: 1_500_000_000, },),).toBe("1.40 GB",);
    expect(adminLora.loraSizeLabel({ ...MODEL, size: 500_000, },),).toBe("0.5 MB",);
    expect(adminLora.loraSizeLabel({ ...MODEL, size: undefined, },),).toBe("—",);
  });
},);
