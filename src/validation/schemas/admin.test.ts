// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin setup-provider schema regression tests.
 *
 * The setup-provider routes exchange an operator-entered body and a stored
 * instance descriptor. The body must reject an instance name the store could
 * not address, and the descriptor must not carry key material back to the
 * operator.
 */
import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import {
  AdminServerProviderDescriptor,
  AdminSetupProviderBody,
  AdminSetupProviderResponse,
  AdminSetupProvidersResponse,
} from "./admin";

/** A stored provider instance as the route returns it. */
const descriptor = {
  name: "acme",
  label: "Acme",
  baseUrl: "https://api.example.com/v1",
  model: "demo-model",
  allowedHosts: ["api.example.com",],
  hasApiKey: true,
  state: "live",
};

describe("AdminSetupProviderBody", () => {
  test("accepts a body with the required fields", () => {
    expect(Value.Check(AdminSetupProviderBody, {
      name: "acme",
      label: "Acme",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
    },)).toBe(true,);
  });

  test("accepts the optional key, host approval and default flag", () => {
    expect(Value.Check(AdminSetupProviderBody, {
      name: "acme",
      label: "Acme",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      apiKey: "sk-value",
      allowedHosts: ["api.example.com",],
      setDefault: true,
    },)).toBe(true,);
  });

  test("rejects an instance name the store could not address", () => {
    expect(Value.Check(AdminSetupProviderBody, {
      name: "-acme",
      label: "Acme",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
    },)).toBe(false,);
  });

  test("rejects a body without a base URL", () => {
    expect(Value.Check(AdminSetupProviderBody, {
      name: "acme",
      label: "Acme",
      model: "demo-model",
    },)).toBe(false,);
  });

  test("rejects a host approval that is not a list of hostnames", () => {
    expect(Value.Check(AdminSetupProviderBody, {
      name: "acme",
      label: "Acme",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      allowedHosts: "api.example.com",
    },)).toBe(false,);
  });
});

describe("AdminServerProviderDescriptor", () => {
  test("accepts a stored instance without key material", () => {
    expect(Value.Check(AdminServerProviderDescriptor, descriptor,)).toBe(true,);
  });

  test("drops key material the store leaked into the descriptor", () => {
    const cleaned = Value.Clean(AdminServerProviderDescriptor, { ...descriptor, apiKey: "sk-secret", },);

    expect((cleaned as Record<string, unknown>).apiKey,).toBeUndefined();
    expect((cleaned as Record<string, unknown>).name,).toBe("acme",);
  });

  test("accepts the reason an instance is not live", () => {
    expect(Value.Check(AdminServerProviderDescriptor, {
      ...descriptor,
      state: "error",
      error: "provider factory rejected the instance",
    },)).toBe(true,);
  });

  test("rejects an instance whose live state is unknown", () => {
    expect(Value.Check(AdminServerProviderDescriptor, { ...descriptor, state: "paused", },)).toBe(false,);
  });
});

describe("AdminSetupProviderResponse", () => {
  test("accepts the response of a saved instance", () => {
    expect(Value.Check(AdminSetupProviderResponse, { ok: true, provider: descriptor, },)).toBe(true,);
  });

  test("rejects a response whose provider is not an instance", () => {
    expect(Value.Check(AdminSetupProviderResponse, {
      ok: true,
      provider: { ...descriptor, hasApiKey: "yes", },
    },)).toBe(false,);
  });
});

describe("AdminSetupProvidersResponse", () => {
  test("accepts the listing of stored instances", () => {
    expect(Value.Check(AdminSetupProvidersResponse, { providers: [descriptor,], },)).toBe(true,);
  });

  test("rejects a listing whose instance is not a descriptor", () => {
    expect(Value.Check(AdminSetupProvidersResponse, {
      providers: [{ ...descriptor, allowedHosts: "api.example.com", },],
    },)).toBe(false,);
  });
});
