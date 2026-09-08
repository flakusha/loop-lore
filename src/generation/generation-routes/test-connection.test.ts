// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/generation-routes/test-connection.ts — the
 * POST /api/generation/test-connection handler.
 *
 * Registers fake LLM providers in the global registry (per the
 * registerProvider convention) and covers auth, validation, unknown
 * provider, healthy / degraded / failing health checks. Each test uses a
 * unique registry name because registerProvider is first-write-wins.
 */
import { afterAll, describe, expect, it, } from "bun:test";
import { registerProvider, unregisterProvider, } from "../providers/registry";
import type { LLMProvider, } from "../providers/types";
import { handleTestConnection, } from "./test-connection";

/** Register a provider whose healthCheck is controlled per test. */
function registerFake(name: string, healthCheck: LLMProvider["healthCheck"],): void {
  registerProvider(name, {
    capabilities: { streaming: false, tools: false, vision: false, thinking: false, },
    healthCheck,
  } as unknown as LLMProvider,);
}

// The provider registry is process-global: unregister fakes so later suites see a pristine registry.
afterAll(() => {
  unregisterProvider("test-conn-healthy",);
  unregisterProvider("test-conn-degraded",);
  unregisterProvider("test-conn-throwing",);
},);
describe("handleTestConnection", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    const response = await handleTestConnection({ provider: "anything", },);
    expect(response,).toBeInstanceOf(Response,);
    expect(response.status,).toBe(401,);
  });

  it.each([
    ["missing body", null,],
    ["non-object body", "provider=foo",],
    ["missing provider field", { model: "m", },],
    ["non-string provider field", { provider: 42, },],
    ["empty provider field", { provider: "", },],
  ],)("returns 400 for %s", async (_label, body,) => {
    const response = await handleTestConnection(body, undefined, "user-1",);
    expect(response.status,).toBe(400,);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error,).toBe("provider is required",);
  },);

  it("returns 404 for an unregistered provider", async () => {
    const response = await handleTestConnection(
      { provider: "no-such-provider", },
      undefined,
      "user-1",
    );
    expect(response.status,).toBe(404,);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error,).toBe('Provider "no-such-provider" not found',);
  });

  it("reports ok for a healthy provider", async () => {
    registerFake("test-conn-healthy", async () => ({
      status: "ok" as const,
      model: "fake-model",
      latencyMs: 3,
    }),);

    const response = await handleTestConnection(
      { provider: "test-conn-healthy", },
      undefined,
      "user-1",
    );
    expect(response.status,).toBe(200,);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.ok,).toBe(true,);
    expect(data.status,).toBe("ok",);
    expect(data.model,).toBe("fake-model",);
    expect(data.latencyMs,).toBe(3,);
    expect(data.error,).toBeUndefined();
  });

  it("reports not-ok for a degraded provider", async () => {
    registerFake("test-conn-degraded", async () => ({ status: "degraded" as const, latencyMs: 1, }),);

    const response = await handleTestConnection(
      { provider: "test-conn-degraded", },
      undefined,
      "user-1",
    );
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.ok,).toBe(false,);
    expect(data.status,).toBe("degraded",);
  });

  it("reports an error payload when healthCheck throws", async () => {
    registerFake("test-conn-throwing", async () => {
      throw new Error("connection refused",);
    },);

    const response = await handleTestConnection(
      { provider: "test-conn-throwing", },
      undefined,
      "user-1",
    );
    expect(response.status,).toBe(200,);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.ok,).toBe(false,);
    expect(data.status,).toBe("error",);
    expect(data.error,).toBe("connection refused",);
  });
});
