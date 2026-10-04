// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/env.test.ts — Edge cases for env.ts (applyEnvironmentOverrides,
// liftFlatEnvKeys, applyProviderEnvVars).

import { describe, expect, test, } from "bun:test";
import type { Config, } from "../schema";
import { createConfigSchema, } from "../schema-class";
import { applyEnvironmentOverrides, applyProviderEnvVars, liftFlatEnvKeys, } from "./env";

// ── Helpers ─────────────────────────────────────────────────

function freshConfig(): Config {
  return structuredClone(createConfigSchema().defaults,) as Config;
}

/** Set env vars; returns a restore fn that puts everything back. */
function withEnv(vars: Record<string, string | undefined>,): () => void {
  const saved = new Map<string, string | undefined>();
  for (const [key, value,] of Object.entries(vars,)) {
    saved.set(key, process.env[key],);
    if (value === undefined) { delete process.env[key]; }
    else { process.env[key] = value; }
  }

  return () => {
    for (const [key, value,] of saved) {
      if (value === undefined) { delete process.env[key]; }
      else { process.env[key] = value; }
    }
  };
}

// ── applyEnvironmentOverrides ────────────────────────────────

describe("applyEnvironmentOverrides", () => {
  test("applies a set env var to its mapped config path", () => {
    const restore = withEnv({ LL_TEST_HOST: "0.0.0.0", },);
    try {
      const config = freshConfig();
      const result = applyEnvironmentOverrides(config, { LL_TEST_HOST: "server.host", },);
      expect(result.server.host,).toBe("0.0.0.0",);
    } finally {
      restore();
    }
  });

  test("leaves config untouched when the env var is unset", () => {
    const restore = withEnv({ LL_TEST_HOST: undefined, },);
    try {
      const config = freshConfig();
      const result = applyEnvironmentOverrides(config, { LL_TEST_HOST: "server.host", },);
      expect(result.server.host,).toBe(config.server.host,);
    } finally {
      restore();
    }
  });

  test("coerces numeric strings to numbers for number-typed paths", () => {
    const restore = withEnv({ LL_TEST_PORT: "8080", },);
    try {
      const result = applyEnvironmentOverrides(freshConfig(), { LL_TEST_PORT: "server.port", },);
      expect(result.server.port,).toBe(8080,);
      expect(typeof result.server.port,).toBe("number",);
    } finally {
      restore();
    }
  });

  test("coerces boolean strings for boolean-typed paths (last write wins)", () => {
    const restore = withEnv({ LL_TEST_A: "true", LL_TEST_B: "false", LL_TEST_C: "1", LL_TEST_D: "0", },);
    try {
      const result = applyEnvironmentOverrides(freshConfig(), {
        LL_TEST_A: "server.trustProxy",
        LL_TEST_B: "server.trustProxy",
        LL_TEST_C: "server.trustProxy",
        LL_TEST_D: "server.trustProxy",
      },);

      expect(result.server.trustProxy,).toBe(false,);
    } finally {
      restore();
    }
  });

  test("keeps unrecognized boolean strings as strings", () => {
    const restore = withEnv({ LL_TEST_FLAG: "yes", },);
    try {
      const result = applyEnvironmentOverrides(freshConfig(), { LL_TEST_FLAG: "server.trustProxy", },);
      expect(result.server.trustProxy as unknown as string,).toBe("yes",);
    } finally {
      restore();
    }
  });

  test("applies an empty-string env var (defined, not undefined)", () => {
    const restore = withEnv({ LL_TEST_HOST: "", },);
    try {
      const result = applyEnvironmentOverrides(freshConfig(), { LL_TEST_HOST: "server.host", },);
      expect(result.server.host,).toBe("",);
    } finally {
      restore();
    }
  });

  test("creates missing intermediate path segments", () => {
    const restore = withEnv({ LL_TEST_DEEP: "x", },);
    try {
      const result = applyEnvironmentOverrides(freshConfig(), { LL_TEST_DEEP: "a.b.c", },);
      expect((result as unknown as Record<string, unknown>).a,).toEqual({ b: { c: "x", }, },);
    } finally {
      restore();
    }
  });

  test("does not mutate the input config", () => {
    const restore = withEnv({ LL_TEST_PORT: "9000", },);
    try {
      const config = freshConfig();
      applyEnvironmentOverrides(config, { LL_TEST_PORT: "server.port", },);
      expect(config.server.port,).toBe(3000,);
    } finally {
      restore();
    }
  });

  test("applies multiple env vars in one call", () => {
    const restore = withEnv({ LL_TEST_HOST: "example.com", LL_TEST_PORT: "4321", },);
    try {
      const result = applyEnvironmentOverrides(freshConfig(), {
        LL_TEST_HOST: "server.host",
        LL_TEST_PORT: "server.port",
      },);

      expect(result.server.host,).toBe("example.com",);
      expect(result.server.port,).toBe(4321,);
    } finally {
      restore();
    }
  });

  test("overwrites a scalar intermediate with an object when path descends through it", () => {
    const restore = withEnv({ LL_TEST_DEEP: "v", },);
    try {
      const result = applyEnvironmentOverrides(freshConfig(), { LL_TEST_DEEP: "server.port.child", },);
      expect(result.server.port as unknown as Record<string, unknown>,).toEqual({ child: "v", },);
    } finally {
      restore();
    }
  });
});

// ── liftFlatEnvKeys ─────────────────────────────────────────

describe("liftFlatEnvKeys", () => {
  test("returns an empty object for null input", () => {
    expect(liftFlatEnvKeys(null, { FOO: "a.b", },),).toEqual({},);
  });

  test("lifts a flat key to its nested path and removes the flat key", () => {
    const parsed = { TELEMETRY_PII_SECRET: "s3cr3t", };
    const result = liftFlatEnvKeys(parsed, { TELEMETRY_PII_SECRET: "observability.telemetry.piiSecret", },);
    expect(result,).toEqual({ observability: { telemetry: { piiSecret: "s3cr3t", }, }, },);
    expect("TELEMETRY_PII_SECRET" in (result as Record<string, unknown>),).toBe(false,);
  });

  test("nested key already present wins; flat key is still removed", () => {
    const parsed = {
      TELEMETRY_PII_SECRET: "flat-value",
      observability: { telemetry: { piiSecret: "nested-value", }, },
    };

    const result = liftFlatEnvKeys(parsed, { TELEMETRY_PII_SECRET: "observability.telemetry.piiSecret", },);
    expect((result as Record<string, unknown>).observability,).toEqual({ telemetry: { piiSecret: "nested-value", }, },);
    expect("TELEMETRY_PII_SECRET" in (result as Record<string, unknown>),).toBe(false,);
  });

  test("skips flat keys whose value is an object (parsed YAML mapping)", () => {
    const parsed = { FOO: { nested: "mapping", }, other: "x", };
    const result = liftFlatEnvKeys(parsed, { FOO: "a.b", },);
    expect(result,).toBe(parsed,);
    expect(parsed.FOO,).toEqual({ nested: "mapping", },);
  });

  test("skips flat keys that are absent", () => {
    const parsed = { other: "x", };
    const result = liftFlatEnvKeys(parsed, { MISSING: "a.b", },);
    expect(result,).toEqual({ other: "x", },);
  });

  test("lifts an empty-string flat value", () => {
    const parsed = { FOO: "", };
    const result = liftFlatEnvKeys(parsed, { FOO: "a.b", },);
    expect((result as Record<string, unknown>).a,).toEqual({ b: "", },);
  });

  test("mutates and returns the same object reference", () => {
    const parsed = { FOO: "v", };
    const result = liftFlatEnvKeys(parsed, { FOO: "a", },);
    expect(result,).toBe(parsed,);
    expect((parsed as Record<string, unknown>).a,).toBe("v",);
  });

  test("passes a non-object parsed value through unchanged", () => {
    const result = liftFlatEnvKeys("scalar" as unknown as Record<string, unknown>, { FOO: "a", },);
    expect(result as unknown as string,).toBe("scalar",);
  });
});

// ── applyProviderEnvVars ────────────────────────────────────

describe("applyProviderEnvVars", () => {
  test("no-op when LLM_PROVIDER_BASE_URL is unset", () => {
    const restore = withEnv({ LLM_PROVIDER_BASE_URL: undefined, },);
    try {
      const config = freshConfig();
      const before = config.generation.providers.openaiCompatible.length;
      const defaultBefore = config.generation.defaultProvider;
      applyProviderEnvVars(config,);
      expect(config.generation.providers.openaiCompatible.length,).toBe(before,);
      expect(config.generation.defaultProvider,).toBe(defaultBefore,);
    } finally {
      restore();
    }
  });

  test("creates a provider with defaults when only BASE_URL is set", () => {
    const restore = withEnv({ LLM_PROVIDER_BASE_URL: "http://localhost:1234/v1", },);
    try {
      const config = freshConfig();
      applyProviderEnvVars(config,);
      const providers = config.generation.providers.openaiCompatible;
      expect(providers.length,).toBe(1,);
      expect(providers[0],).toMatchObject({
        name: "default",
        label: "Default Provider",
        baseUrl: "http://localhost:1234/v1",
        apiKey: undefined,
        model: "default",
        timeout: 30_000,
        retries: 3,
        allowUserApiKey: true,
        models: {},
      },);

      expect(config.generation.defaultProvider,).toBe("default",);
    } finally {
      restore();
    }
  });

  test("applies all LLM_PROVIDER_* env vars", () => {
    const restore = withEnv({
      LLM_PROVIDER_BASE_URL: "http://llm:8080/v1",
      LLM_PROVIDER_NAME: "custom",
      LLM_PROVIDER_LABEL: "Custom LLM",
      LLM_PROVIDER_API_KEY: "sk-test",
      LLM_PROVIDER_MODEL: "gpt-x",
      LLM_PROVIDER_TIMEOUT: "5000",
      LLM_PROVIDER_RETRIES: "7",
      LLM_PROVIDER_ALLOW_USER_KEY: "false",
    },);

    try {
      const config = freshConfig();
      applyProviderEnvVars(config,);
      expect(config.generation.providers.openaiCompatible[0],).toMatchObject({
        name: "custom",
        label: "Custom LLM",
        baseUrl: "http://llm:8080/v1",
        apiKey: "sk-test",
        model: "gpt-x",
        timeout: 5000,
        retries: 7,
        allowUserApiKey: false,
      },);

      expect(config.generation.defaultProvider,).toBe("custom",);
    } finally {
      restore();
    }
  });

  test("falls back to defaults for non-numeric TIMEOUT and RETRIES", () => {
    const restore = withEnv({
      LLM_PROVIDER_BASE_URL: "http://localhost/v1",
      LLM_PROVIDER_TIMEOUT: "not-a-number",
      LLM_PROVIDER_RETRIES: "NaN-ish",
    },);

    try {
      const config = freshConfig();
      applyProviderEnvVars(config,);
      expect(config.generation.providers.openaiCompatible[0]?.timeout,).toBe(30_000,);
      expect(config.generation.providers.openaiCompatible[0]?.retries,).toBe(3,);
    } finally {
      restore();
    }
  });

  test("allowUserApiKey stays true for any value other than exact 'false'", () => {
    const restore = withEnv({ LLM_PROVIDER_BASE_URL: "http://localhost/v1", LLM_PROVIDER_ALLOW_USER_KEY: "0", },);
    try {
      const config = freshConfig();
      applyProviderEnvVars(config,);
      expect(config.generation.providers.openaiCompatible[0]?.allowUserApiKey,).toBe(true,);
    } finally {
      restore();
    }
  });

  test("LLM_DEFAULT_PROVIDER sets defaultProvider when none exists", () => {
    const restore = withEnv({ LLM_PROVIDER_BASE_URL: "http://localhost/v1", LLM_DEFAULT_PROVIDER: "other", },);
    try {
      const config = freshConfig();
      applyProviderEnvVars(config,);
      expect(config.generation.defaultProvider,).toBe("other",);
    } finally {
      restore();
    }
  });

  test("existing defaultProvider wins over LLM_DEFAULT_PROVIDER", () => {
    const restore = withEnv({ LLM_PROVIDER_BASE_URL: "http://localhost/v1", LLM_DEFAULT_PROVIDER: "other", },);
    try {
      const config = freshConfig();
      config.generation.defaultProvider = "preexisting";
      applyProviderEnvVars(config,);
      expect(config.generation.defaultProvider,).toBe("preexisting",);
    } finally {
      restore();
    }
  });

  test("appends to an existing providers array instead of replacing it", () => {
    const restore = withEnv({ LLM_PROVIDER_BASE_URL: "http://localhost/v1", },);
    try {
      const config = freshConfig();
      config.generation.providers.openaiCompatible.push({
        name: "preexisting",
        label: "Pre",
        baseUrl: "http://old/v1",
        apiKey: undefined,
        model: "old-model",
        timeout: 1000,
        retries: 1,
        allowUserApiKey: false,
        models: {},
      },);

      applyProviderEnvVars(config,);
      expect(config.generation.providers.openaiCompatible.length,).toBe(2,);
      expect(config.generation.providers.openaiCompatible[0]?.name,).toBe("preexisting",);
      expect(config.generation.providers.openaiCompatible[1]?.name,).toBe("default",);
    } finally {
      restore();
    }
  });
});
