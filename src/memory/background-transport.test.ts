// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, test, } from "bun:test";
import {
  OPENROUTER_BASE_URL,
  resolveRerankApiKey,
  resolveRerankProvider,
} from "./background-transport";

const ENV_KEYS = ["E2E_RERANK_PROVIDER", "E2E_RERANK_KEY", "BYOK_E2E_API_KEY",] as const;
type RerankEnvKey = (typeof ENV_KEYS)[number];
const original = new Map<RerankEnvKey, string | undefined>();

/** Set an env var for one test, remembering its original value for teardown. */
function setEnv(key: RerankEnvKey, value: string | undefined,): void {
  if (!original.has(key,)) { original.set(key, process.env[key],); }
  if (value === undefined) { delete process.env[key]; }
  else { process.env[key] = value; }
}

afterEach(() => {
  for (const [key, value,] of original) {
    if (value === undefined) { delete process.env[key]; }
    else { process.env[key] = value; }
  }

  original.clear();
},);

describe("OPENROUTER_BASE_URL", () => {
  test("is the OpenAI-compatible OpenRouter base", () => {
    expect(OPENROUTER_BASE_URL,).toBe("https://openrouter.ai/api/v1",);
  });
});

describe("resolveRerankProvider", () => {
  test("defaults to ollama when the env var is unset", () => {
    setEnv("E2E_RERANK_PROVIDER", undefined,);
    expect(resolveRerankProvider(),).toBe("ollama",);
  });

  test("selects openrouter on an exact match only", () => {
    setEnv("E2E_RERANK_PROVIDER", "openrouter",);
    expect(resolveRerankProvider(),).toBe("openrouter",);
    setEnv("E2E_RERANK_PROVIDER", "openrouter ",);
    expect(resolveRerankProvider(),).toBe("ollama",);
  });
});

describe("resolveRerankApiKey", () => {
  test("returns undefined when no key env var is set", () => {
    setEnv("E2E_RERANK_KEY", undefined,);
    setEnv("BYOK_E2E_API_KEY", undefined,);
    expect(resolveRerankApiKey(OPENROUTER_BASE_URL,),).toBeUndefined();
  });

  test("prefers the explicit rerank key even on a loopback endpoint", () => {
    setEnv("E2E_RERANK_KEY", "explicit-key",);
    setEnv("BYOK_E2E_API_KEY", "shared-key",);
    expect(resolveRerankApiKey("http://localhost:11434",),).toBe("explicit-key",);
  });

  test("sends the trimmed shared key only to remote endpoints", () => {
    setEnv("E2E_RERANK_KEY", undefined,);
    setEnv("BYOK_E2E_API_KEY", "  shared-key  ",);
    expect(resolveRerankApiKey(OPENROUTER_BASE_URL,),).toBe("shared-key",);
    expect(resolveRerankApiKey("http://localhost:11434",),).toBeUndefined();
    expect(resolveRerankApiKey("http://127.0.0.1:8080/",),).toBeUndefined();
    expect(resolveRerankApiKey("http://[::1]:11434",),).toBeUndefined();
  });
});
