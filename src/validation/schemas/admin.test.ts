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
  ADMIN_NAME_PATTERN,
  AdminComfyUIDiscoveryResponse,
  AdminComfyUISetupBody,
  AdminDbBackupRestoreBody,
  AdminLlamaSwapConfigBody,
  AdminLlamaSwapStatusResponse,
  AdminSdCppDiscoveryResponse,
  AdminSdCppSetupBody,
  AdminSdSetupNameParams,
  AdminServerProviderDescriptor,
  AdminSetupProviderBody,
  AdminSetupProviderResponse,
  AdminSetupProvidersResponse,
  ServerProviderKindSchema,
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

 describe("AdminSdCppSetupBody", () => {
 test("accepts a named instance with a base URL", () => {
 expect(Value.Check(AdminSdCppSetupBody, { name: "local-sd", baseUrl: "http://127.0.0.1:8080", },)).toBe(true,);
 });

 test("rejects an instance name the store could not address", () => {
 expect(Value.Check(AdminSdCppSetupBody, { name: "-bad", baseUrl: "http://127.0.0.1:8080", },)).toBe(false,);
 });
 });

 describe("AdminSdCppDiscoveryResponse", () => {
 test("accepts a discovery response with one entry", () => {
 expect(Value.Check(AdminSdCppDiscoveryResponse, { probedAt: "2026-11-14T00:00:00.000Z", providers: [{ name: "local-sd", baseUrl: "http://127.0.0.1:8080", source: "config", dispatching: true, reachable: true, },], },)).toBe(true,);
 });

 test("rejects an entry from an unknown source", () => {
 expect(Value.Check(AdminSdCppDiscoveryResponse, { probedAt: "2026-11-14T00:00:00.000Z", providers: [{ name: "local-sd", baseUrl: "http://127.0.0.1:8080", source: "manual", dispatching: true, reachable: true, },], },)).toBe(false,);
 });
 });

 describe("AdminComfyUISetupBody", () => {
 test("accepts a named instance with a base URL", () => {
 expect(Value.Check(AdminComfyUISetupBody, { name: "local-comfy", baseUrl: "http://127.0.0.1:8188", },)).toBe(true,);
 });

 test("rejects an instance name the store could not address", () => {
 expect(Value.Check(AdminComfyUISetupBody, { name: "-bad", baseUrl: "http://127.0.0.1:8188", },)).toBe(false,);
 });
 });

 describe("AdminComfyUIDiscoveryResponse", () => {
 test("accepts a discovery response with one entry", () => {
 expect(Value.Check(AdminComfyUIDiscoveryResponse, { probedAt: "2026-11-14T00:00:00.000Z", providers: [{ name: "local-comfy", baseUrl: "http://127.0.0.1:8188", source: "stored", dispatching: false, reachable: false, },], },)).toBe(true,);
 });

 test("rejects an entry from an unknown source", () => {
 expect(Value.Check(AdminComfyUIDiscoveryResponse, { probedAt: "2026-11-14T00:00:00.000Z", providers: [{ name: "local-comfy", baseUrl: "http://127.0.0.1:8188", source: "manual", dispatching: false, reachable: false, },], },)).toBe(false,);
 });
 });

describe("AdminSetupProviderBody kind", () => {
  test("accepts every materializable provider kind", () => {
    for (const kind of ["openai-compatible", "anthropic", "ollama-native",]) {
      expect(Value.Check(AdminSetupProviderBody, {
        name: "acme",
        label: "Acme",
        baseUrl: "https://api.example.com/v1",
        model: "demo-model",
        kind,
      },),).toBe(true,);
    }
  });

  test("accepts a body without a kind — the openai-compatible default", () => {
    expect(Value.Check(AdminSetupProviderBody, {
      name: "acme",
      label: "Acme",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
    },),).toBe(true,);
  });

  test("rejects an unknown provider kind", () => {
    expect(Value.Check(AdminSetupProviderBody, {
      name: "acme",
      label: "Acme",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      kind: "openai-v2",
    },),).toBe(false,);
  });
});

describe("ServerProviderKindSchema", () => {
  test("accepts every materializable kind on its own", () => {
    for (const kind of ["openai-compatible", "anthropic", "ollama-native",]) {
      expect(Value.Check(ServerProviderKindSchema, kind,),).toBe(true,);
    }
  });

  test("rejects an unknown kind", () => {
    expect(Value.Check(ServerProviderKindSchema, "openai-v2",),).toBe(false,);
  });
});

describe("bounded admin boundaries", () => {
  test("the shared name pattern admits slugs and rejects path traversal", () => {
    const pattern = new RegExp(ADMIN_NAME_PATTERN,);
    expect(pattern.test("local-sdcpp.01",),).toBe(true,);
    expect(pattern.test("../secret"),).toBe(false,);
  });

  test("restore requires the exact confirmation and a bounded name", () => {
    expect(Value.Check(AdminDbBackupRestoreBody, {
      name: "loop-lore-port-3000-backup.db",
      confirmation: "RESTORE",
    },),).toBe(true,);

    expect(Value.Check(AdminDbBackupRestoreBody, {
      name: "backup.db",
      confirmation: "yes",
    },),).toBe(false,);

    expect(Value.Check(AdminDbBackupRestoreBody, {
      name: "../outside.db",
      confirmation: "RESTORE",
    },),).toBe(false,);
  });

  test("llama-swap config checks port and non-blank path at the boundary", () => {
    expect(Value.Check(AdminLlamaSwapConfigBody, {
      listenPort: 8_080,
      configPath: " /srv/llama-swap.yml ",
    },),).toBe(true,);

    expect(Value.Check(AdminLlamaSwapConfigBody, { listenPort: 65_536, },),).toBe(false,);
    expect(Value.Check(AdminLlamaSwapConfigBody, { configPath: "   ", },),).toBe(false,);
  });

  test("llama-swap status response requires the reachability flag", () => {
    expect(Value.Check(AdminLlamaSwapStatusResponse, {
      configured: true,
      autoStartEnabled: false,
      listenPort: 8_080,
      configPath: "/srv/llama-swap.yml",
      running: true,
    },),).toBe(true,);

    expect(Value.Check(AdminLlamaSwapStatusResponse, { configured: true, },),).toBe(false,);
  });

  test("setup delete names use the same boundary as create names", () => {
    expect(Value.Check(AdminSdSetupNameParams, { name: "my-sdcpp" },),).toBe(true,);
    expect(Value.Check(AdminSdSetupNameParams, { name: "../x" },),).toBe(false,);
  });
});
