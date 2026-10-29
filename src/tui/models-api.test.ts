// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct tests for the models API module: URL/method/auth of every route and
 * the error mapping in `buildResult` (403 -> ADMIN_ONLY, HTTP n, network
 * error). The overlay tests cover the rendering; these pin the wire contract.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { safeFetch, } from "../utils";
import type { FetchResult, SafeFetchOptions, } from "../utils/safe-fetch/types";
import {
  ADMIN_ONLY,
  assignRole,
  clearRole,
  loadProviderModels,
  loadProviders,
  loadPublicProviders,
  loadRoles,
  rescanProviders,
  setFetch,
  testProviderConnection,
} from "./models-api";

interface Recorded {
  url: string;
  options: SafeFetchOptions;
}

const calls: Recorded[] = [];
const realFetch = safeFetch;

function ok<T,>(data: T,): Promise<FetchResult<T>> {
  return Promise.resolve({ ok: true, data, status: 200, headers: new Headers(), },);
}

function fail<T,>(status: number,): Promise<FetchResult<T>> {
  return Promise.resolve({
    ok: false,
    error: new Error(`HTTP ${status}`,),
    status,
    headers: new Headers(),
  },);
}

function stub<T,>(result: () => Promise<FetchResult<T>>,): void {
  setFetch(<U,>(url: string, options?: SafeFetchOptions,): Promise<FetchResult<U>> => {
    calls.push({ url, options: options ?? {}, },);
    return result() as Promise<FetchResult<U>>;
  },);
}

afterEach(() => {
  setFetch(realFetch,);
  calls.length = 0;
},);

describe("models-api", () => {
  it("loadRoles GETs the admin roles route with the bearer token", async () => {
    stub(() => ok({ roles: [], overrides: {}, validRoles: [], },));
    const result = await loadRoles("tok",);
    expect(result.ok,).toBe(true,);
    expect(calls[0]!.url,).toContain("/admin/model-roles",);
    expect(calls[0]!.options.auth,).toEqual({ sessionToken: "tok", },);
  });

  it("maps a 403 to the ADMIN_ONLY message", async () => {
    stub(() => fail(403,));
    expect(await loadRoles("tok",),).toEqual({ ok: false, error: ADMIN_ONLY, status: 403, },);
    expect(ADMIN_ONLY,).toContain("admin.system",);
  });

  it("maps other statuses to HTTP n", async () => {
    stub(() => fail(500,));
    expect(await loadProviders(undefined,),).toEqual({ ok: false, error: "HTTP 500", status: 500, },);
  });

  it("loadProviders and rescanProviders hit their routes with the right method", async () => {
    stub(() => ok({ providers: [], },));
    await loadProviders("tok",);
    await rescanProviders("tok",);
    expect(calls[0]!.url,).toContain("/admin/providers",);
    expect(calls[0]!.options.method,).toBe("GET",);
    expect(calls[1]!.url,).toContain("/admin/providers/rescan",);
    expect(calls[1]!.options.method,).toBe("POST",);
  });

  it("loadProviderModels threads the provider name and token", async () => {
    stub(() => ok({ name: "openai", label: "OpenAI", models: [], status: "healthy", },));
    const result = await loadProviderModels({ provider: "openai", sessionToken: "tok", },);
    expect(result.ok,).toBe(true,);
    expect(calls[0]!.url,).toContain("/admin/providers/openai/models",);
    expect(calls[0]!.options.auth,).toEqual({ sessionToken: "tok", },);
  });

  it("assignRole PUTs and clearRole DELETEs the role override", async () => {
    stub(() => ok(true,));
    await assignRole({ role: "main", provider: "openai", model: "gpt-x", sessionToken: "tok", },);
    expect(calls[0]!.options.method,).toBe("PUT",);
    expect(JSON.stringify(calls[0]!.options.body,),).toContain("gpt-x",);
    await clearRole({ role: "main", sessionToken: "tok", },);
    expect(calls[1]!.options.method,).toBe("DELETE",);
    expect(calls[1]!.url,).toContain("/admin/model-roles/main",);
  });

  it("loadPublicProviders needs no token", async () => {
    stub(() => ok({ providers: [], },));
    await loadPublicProviders();
    expect(calls[0]!.url,).toContain("/providers",);
    expect(calls[0]!.url,).not.toContain("admin",);
    expect(calls[0]!.options.auth,).toBeUndefined();
  });

  it("testProviderConnection POSTs the provider name", async () => {
    stub(() => ok({ ok: true, status: "reachable", latencyMs: 12, },));
    const result = await testProviderConnection({ provider: "openai", sessionToken: "tok", },);
    expect(result,).toEqual({ ok: true, data: { ok: true, status: "reachable", latencyMs: 12, }, },);
    expect(calls[0]!.options.method,).toBe("POST",);
    expect(JSON.stringify(calls[0]!.options.body,),).toContain("openai",);
  });

  it("propagates a network failure as the error message", async () => {
    stub((): Promise<never> => Promise.reject(new Error("ECONNREFUSED",),));
    expect(await loadRoles(undefined,),).toEqual({ ok: false, error: "ECONNREFUSED", },);
  });
});
