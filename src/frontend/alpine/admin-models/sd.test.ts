// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "../i18n.test-helper";
import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { ApiFetchMock, Toast, } from "../../tests/test-types";
import { type LocalModelsState, sdState, } from "./sd";

const g = globalThis as unknown as { apiFetch?: ApiFetchMock; showToast?: (...args: unknown[]) => void };
const originalFetch = g.apiFetch;
const originalToast = g.showToast;

let calls: { url: string; opts?: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let toasts: Toast[] = [];
let state: LocalModelsState;

function freshState(): LocalModelsState {
  return {
    ...sdState,
    sdcppProviders: [],
    sdcppProbedAt: null,
    sdcppError: "",
    sdcppForm: { name: "local", label: "", baseUrl: "http://127.0.0.1:9010", purpose: "", apiKey: "", },
    comfyProviders: [],
    comfyProbedAt: null,
    comfyError: "",
    comfyForm: { name: "comfy", label: "", baseUrl: "http://127.0.0.1:8188", purpose: "", workflow: "", apiKey: "", },
  } as LocalModelsState;
}

beforeEach(() => {
  calls = [];
  toasts = [];
  handler = async () => Response.json({},);
  g.apiFetch = (url, opts,) => {
    calls.push({ url, opts, },);
    return handler(url, opts,);
  };

  g.showToast = (type, message,) => {
    toasts.push({ type: String(type,), message: String(message,), },);
  };

  state = freshState();
},);

afterEach(() => {
  g.apiFetch = originalFetch;
  g.showToast = originalToast;
},);

test("loadSdCppDiscovery stores probed instances", async () => {
  handler = async () =>
    Response.json({ probedAt: "2026-11-18T00:00:00Z", providers: [{ name: "local", reachable: true, },], },);

  await sdState.loadSdCppDiscovery!.call(state,);

  expect(calls[0]?.url,).toBe("/api/admin/sd-status/sdcpp",);
  expect(state.sdcppProviders,).toHaveLength(1,);
  expect(state.sdcppProbedAt,).toBe("2026-11-18T00:00:00Z",);
  expect(state.sdcppLoading,).toBe(false,);
});

test("loadComfyDiscovery surfaces a server error message", async () => {
  handler = async () => Response.json({ message: "admin rights required", }, { status: 403, },);

  await sdState.loadComfyDiscovery!.call(state,);

  expect(calls[0]?.url,).toBe("/api/admin/sd-status/comfyui",);
  expect(state.comfyError,).toBe("admin rights required",);
  expect(state.comfyProviders,).toEqual([],);
  expect(state.comfyLoading,).toBe(false,);
});

test("saveSdCppSetup posts only supplied optional fields and reloads discovery", async () => {
  state.sdcppForm.label = " Local ";
  state.sdcppForm.purpose = "generate";
  state.sdcppForm.apiKey = "secret";
  handler = async (url,) =>
    url.includes("/setup",)
      ? Response.json({ ok: true, provider: { name: "local", }, generationLive: true, },)
      : Response.json({ probedAt: "now", providers: [{ name: "local", reachable: true, },], },);

  await sdState.saveSdCppSetup!.call(state,);

  expect(calls[0]?.url,).toBe("/api/admin/sd-status/sdcpp/setup",);
  expect(calls[0]?.opts?.method,).toBe("POST",);
  expect(JSON.parse(String(calls[0]?.opts?.body,),),).toEqual({
    name: "local",
    baseUrl: "http://127.0.0.1:9010",
    label: "Local",
    purpose: "generate",
    apiKey: "secret",
  },);

  expect(state.sdcppForm.apiKey,).toBe("",);
  expect(state.sdcppProviders,).toHaveLength(1,);
  expect(toasts[0]?.type,).toBe("success",);
  expect(state.sdcppSaving,).toBe(false,);
});

test("saveSdCppSetup surfaces a rejected setup message", async () => {
  handler = async () => Response.json({ message: "instance not usable at http://127.0.0.1:9010", }, { status: 502, },);

  await sdState.saveSdCppSetup!.call(state,);

  expect(state.sdcppError,).toBe("instance not usable at http://127.0.0.1:9010",);
  expect(state.sdcppSaving,).toBe(false,);
});

test("saveComfySetup sends the workflow field and clears the API key", async () => {
  state.comfyForm.workflow = "portrait";
  state.comfyForm.apiKey = "secret";
  handler = async (url,) =>
    url.includes("/setup",)
      ? Response.json({ ok: true, provider: { name: "comfy", }, generationLive: true, },)
      : Response.json({ probedAt: "now", providers: [], },);

  await sdState.saveComfySetup!.call(state,);

  expect(calls[0]?.url,).toBe("/api/admin/sd-status/comfyui/setup",);
  expect(JSON.parse(String(calls[0]?.opts?.body,),),).toEqual({
    name: "comfy",
    baseUrl: "http://127.0.0.1:8188",
    workflow: "portrait",
    apiKey: "secret",
  },);

  expect(state.comfyForm.apiKey,).toBe("",);
  expect(state.comfySaving,).toBe(false,);
});

test("deleteSdCppSetup encodes the name and reloads discovery", async () => {
  handler = async () => Response.json({ probedAt: "now", providers: [], },);

  await sdState.deleteSdCppSetup!.call(state, "my instance",);

  expect(calls[0]?.url,).toBe("/api/admin/sd-status/sdcpp/setup/my%20instance",);
  expect(calls[0]?.opts?.method,).toBe("DELETE",);
  expect(state.sdcppSaving,).toBe(false,);
});

test("deleteComfySetup surfaces a delete failure", async () => {
  handler = async () => Response.json({ message: "setup not found", }, { status: 404, },);

  await sdState.deleteComfySetup!.call(state, "missing",);

  expect(state.comfyError,).toBe("setup not found",);
  expect(state.comfySaving,).toBe(false,);
});
