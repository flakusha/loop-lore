// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/pii-safety.test.ts — Edge cases for pii-safety.ts (secret
// resolution precedence, dev/prod gating, length guard boundaries).

import { describe, expect, test, } from "bun:test";
import type { Config, } from "../schema";
import { createConfigSchema, } from "../schema-class";
import {
  isDevEnv,
  MIN_PII_SECRET_LENGTH,
  NSFW_PII_DEV_FALLBACK,
  REPORTER_HASH_DEV_FALLBACK,
  resolveNsfwPiiSecret,
  resolvePiiSecret,
  resolveReporterHashSecret,
  resolveTelemetryPiiSecret,
  TELEMETRY_PII_DEV_FALLBACK,
  validatePiiSafety,
} from "./pii-safety";

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

function clearSecretEnv(): () => void {
  return withEnv({
    NSFW_PII_SECRET: undefined,
    NSFW_FLAG_REPORTER_HASH_SECRET: undefined,
    NSFW_MODERATION_HMAC_SECRET: undefined,
    TELEMETRY_PII_SECRET: undefined,
  },);
}

const LONG = "a".repeat(MIN_PII_SECRET_LENGTH,);

// ── isDevEnv ────────────────────────────────────────────────

describe("isDevEnv", () => {
  test("true for test/development/dev NODE_ENV", () => {
    for (const value of ["test", "development", "dev",]) {
      const restore = withEnv({ NODE_ENV: value, },);
      try {
        expect(isDevEnv(),).toBe(true,);
      } finally {
        restore();
      }
    }
  });

  test("false for production/staging/unset/empty NODE_ENV", () => {
    for (const value of ["production", "staging", "", undefined,]) {
      const restore = withEnv({ NODE_ENV: value, },);
      try {
        expect(isDevEnv(),).toBe(false,);
      } finally {
        restore();
      }
    }
  });

  test("match is case-sensitive", () => {
    const restore = withEnv({ NODE_ENV: "TEST", },);
    try {
      expect(isDevEnv(),).toBe(false,);
    } finally {
      restore();
    }
  });
});

// ── resolvePiiSecret ────────────────────────────────────────

describe("resolvePiiSecret", () => {
  test("configured value wins over env vars", () => {
    const restore = withEnv({ LL_A: "from-env", LL_B: "from-env-2", },);
    try {
      expect(resolvePiiSecret("from-config", ["LL_A", "LL_B",], "fallback", "missing",),).toBe("from-config",);
    } finally {
      restore();
    }
  });

  test("first set env var wins in order", () => {
    const restore = withEnv({ LL_A: "first", LL_B: "second", },);
    try {
      expect(resolvePiiSecret(undefined, ["LL_A", "LL_B",], "fallback", "missing",),).toBe("first",);
    } finally {
      restore();
    }
  });

  test("later env var used when earlier is unset", () => {
    const restore = withEnv({ LL_A: undefined, LL_B: "second", },);
    try {
      expect(resolvePiiSecret(undefined, ["LL_A", "LL_B",], "fallback", "missing",),).toBe("second",);
    } finally {
      restore();
    }
  });

  test("whitespace-only configured value falls through to env", () => {
    const restore = withEnv({ LL_A: "from-env", },);
    try {
      expect(resolvePiiSecret("   ", ["LL_A",], "fallback", "missing",),).toBe("from-env",);
    } finally {
      restore();
    }
  });

  test("whitespace-only env value falls through to fallback", () => {
    const restore = withEnv({ LL_A: "  ", NODE_ENV: "development", },);
    try {
      expect(resolvePiiSecret(undefined, ["LL_A",], "fallback", "missing",),).toBe("fallback",);
    } finally {
      restore();
    }
  });

  test("dev fallback returned when nothing is set in dev", () => {
    const restore = withEnv({ LL_A: undefined, NODE_ENV: "development", },);
    try {
      expect(resolvePiiSecret(undefined, ["LL_A",], "dev-fallback", "missing",),).toBe("dev-fallback",);
    } finally {
      restore();
    }
  });

  test("throws with missing message and openssl hint in production", () => {
    const restore = withEnv({ LL_A: undefined, NODE_ENV: "production", },);
    try {
      expect(() => resolvePiiSecret(undefined, ["LL_A",], "dev-fallback", "LL_A is required",)).toThrow(
        /LL_A is required.*openssl rand -base64 48/s,
      );
    } finally {
      restore();
    }
  });

  test("returns a short configured secret as-is (length guard lives in validatePiiSafety)", () => {
    const restore = withEnv({ NODE_ENV: "production", },);
    try {
      expect(resolvePiiSecret("short", [], "fallback", "missing",),).toBe("short",);
    } finally {
      restore();
    }
  });
});

// ── resolveNsfwPiiSecret ────────────────────────────────────

describe("resolveNsfwPiiSecret", () => {
  test("config.piiSecret wins over NSFW_PII_SECRET env", () => {
    const restore = withEnv({ NSFW_PII_SECRET: "env-secret", },);
    try {
      expect(resolveNsfwPiiSecret({ piiSecret: "config-secret", },),).toBe("config-secret",);
    } finally {
      restore();
    }
  });

  test("NSFW_PII_SECRET env used when config is undefined", () => {
    const restore = withEnv({ NSFW_PII_SECRET: "env-secret", },);
    try {
      expect(resolveNsfwPiiSecret(undefined,),).toBe("env-secret",);
    } finally {
      restore();
    }
  });

  test("dev fallback constant in test env", () => {
    const restore = clearSecretEnv();
    try {
      expect(resolveNsfwPiiSecret({},),).toBe(NSFW_PII_DEV_FALLBACK,);
    } finally {
      restore();
    }
  });

  test("throws in production when unset", () => {
    const restore = withEnv({ NODE_ENV: "production", },);
    try {
      expect(() => resolveNsfwPiiSecret({},)).toThrow(/NSFW_PII_SECRET/,);
    } finally {
      restore();
    }
  });
});

// ── resolveReporterHashSecret ───────────────────────────────

describe("resolveReporterHashSecret", () => {
  test("explicit reporterHashSecret wins over every env var", () => {
    const restore = withEnv({
      NSFW_FLAG_REPORTER_HASH_SECRET: "flag-env",
      NSFW_MODERATION_HMAC_SECRET: "hmac-env",
      NSFW_PII_SECRET: "pii-env",
    },);
    try {
      expect(resolveReporterHashSecret({ reporterHashSecret: "explicit", },),).toBe("explicit",);
    } finally {
      restore();
    }
  });

  test("NSFW_FLAG_REPORTER_HASH_SECRET env used when no explicit secret", () => {
    const restore = withEnv({ NSFW_FLAG_REPORTER_HASH_SECRET: "flag-env", },);
    try {
      expect(resolveReporterHashSecret({},),).toBe("flag-env",);
    } finally {
      restore();
    }
  });

  test("NSFW_MODERATION_HMAC_SECRET env is the legacy fallback", () => {
    const restore = withEnv({ NSFW_MODERATION_HMAC_SECRET: "hmac-env", },);
    try {
      expect(resolveReporterHashSecret({},),).toBe("hmac-env",);
    } finally {
      restore();
    }
  });

  test("NSFW_PII_SECRET env is the last resort", () => {
    const restore = withEnv({ NSFW_PII_SECRET: "pii-env", },);
    try {
      expect(resolveReporterHashSecret({},),).toBe("pii-env",);
    } finally {
      restore();
    }
  });

  test("flag-reporter env beats moderation-HMAC env", () => {
    const restore = withEnv({
      NSFW_FLAG_REPORTER_HASH_SECRET: "flag-env",
      NSFW_MODERATION_HMAC_SECRET: "hmac-env",
    },);
    try {
      expect(resolveReporterHashSecret({},),).toBe("flag-env",);
    } finally {
      restore();
    }
  });

  test("dev fallback constant in test env", () => {
    const restore = clearSecretEnv();
    try {
      expect(resolveReporterHashSecret({},),).toBe(REPORTER_HASH_DEV_FALLBACK,);
    } finally {
      restore();
    }
  });

  test("throws in production when unset", () => {
    const restore = withEnv({ NODE_ENV: "production", },);
    try {
      expect(() => resolveReporterHashSecret({},)).toThrow(/NSFW_FLAG_REPORTER_HASH_SECRET/,);
    } finally {
      restore();
    }
  });
});

// ── resolveTelemetryPiiSecret ───────────────────────────────

describe("resolveTelemetryPiiSecret", () => {
  test("config.piiSecret wins over TELEMETRY_PII_SECRET env", () => {
    const restore = withEnv({ TELEMETRY_PII_SECRET: "env-secret", },);
    try {
      expect(resolveTelemetryPiiSecret({ piiSecret: "config-secret", },),).toBe("config-secret",);
    } finally {
      restore();
    }
  });

  test("TELEMETRY_PII_SECRET env used when config is undefined", () => {
    const restore = withEnv({ TELEMETRY_PII_SECRET: "env-secret", },);
    try {
      expect(resolveTelemetryPiiSecret(undefined,),).toBe("env-secret",);
    } finally {
      restore();
    }
  });

  test("dev fallback constant in test env", () => {
    const restore = clearSecretEnv();
    try {
      expect(resolveTelemetryPiiSecret({},),).toBe(TELEMETRY_PII_DEV_FALLBACK,);
    } finally {
      restore();
    }
  });

  test("throws in production when unset", () => {
    const restore = withEnv({ NODE_ENV: "production", },);
    try {
      expect(() => resolveTelemetryPiiSecret({},)).toThrow(/TELEMETRY_PII_SECRET/,);
    } finally {
      restore();
    }
  });
});

// ── validatePiiSafety ───────────────────────────────────────

describe("validatePiiSafety", () => {
  test("no-op in dev even with no secrets configured", () => {
    const restore = withEnv({ NODE_ENV: "test", },);
    try {
      const config = freshConfig();
      delete config.nsfw.piiSecret;
      delete config.nsfw.reporterHashSecret;
      expect(() => validatePiiSafety(config,)).not.toThrow();
    } finally {
      restore();
    }
  });

  test("passes in production when all secrets meet the minimum length", () => {
    const restore = withEnv({ NODE_ENV: "production", },);
    try {
      const config = freshConfig();
      config.nsfw.piiSecret = LONG;
      config.nsfw.reporterHashSecret = LONG;
      config.observability!.telemetry!.piiSecret = LONG;
      expect(() => validatePiiSafety(config,)).not.toThrow();
    } finally {
      restore();
    }
  });

  test("passes in production when secrets come from env vars", () => {
    const restore = withEnv({
      NODE_ENV: "production",
      NSFW_PII_SECRET: LONG,
      NSFW_FLAG_REPORTER_HASH_SECRET: LONG,
      TELEMETRY_PII_SECRET: LONG,
    },);
    try {
      const config = freshConfig();
      delete config.nsfw.piiSecret;
      delete config.nsfw.reporterHashSecret;
      delete config.observability!.telemetry!.piiSecret;
      expect(() => validatePiiSafety(config,)).not.toThrow();
    } finally {
      restore();
    }
  });

  test("boundary: secret of exactly MIN_PII_SECRET_LENGTH passes", () => {
    const restore = withEnv({ NODE_ENV: "production", },);
    try {
      const config = freshConfig();
      config.nsfw.piiSecret = "b".repeat(MIN_PII_SECRET_LENGTH,);
      config.nsfw.reporterHashSecret = "c".repeat(MIN_PII_SECRET_LENGTH,);
      config.observability!.telemetry!.piiSecret = "d".repeat(MIN_PII_SECRET_LENGTH,);
      expect(() => validatePiiSafety(config,)).not.toThrow();
    } finally {
      restore();
    }
  });

  test("boundary: secret one char short fails", () => {
    const restore = withEnv({ NODE_ENV: "production", },);
    try {
      const config = freshConfig();
      config.nsfw.piiSecret = "b".repeat(MIN_PII_SECRET_LENGTH - 1,);
      config.nsfw.reporterHashSecret = LONG;
      config.observability!.telemetry!.piiSecret = LONG;
      expect(() => validatePiiSafety(config,)).toThrow(
        new RegExp(`NSFW PII secret is only ${MIN_PII_SECRET_LENGTH - 1} characters`,),
      );
    } finally {
      restore();
    }
  });

  test("short reporter-hash secret fails with its own name", () => {
    const restore = withEnv({ NODE_ENV: "production", },);
    try {
      const config = freshConfig();
      config.nsfw.piiSecret = LONG;
      config.nsfw.reporterHashSecret = "short";
      config.observability!.telemetry!.piiSecret = LONG;
      expect(() => validatePiiSafety(config,)).toThrow(/Reporter-hash secret is only 5 characters/,);
    } finally {
      restore();
    }
  });

  test("short telemetry secret fails with its own name", () => {
    const restore = withEnv({ NODE_ENV: "production", },);
    try {
      const config = freshConfig();
      config.nsfw.piiSecret = LONG;
      config.nsfw.reporterHashSecret = LONG;
      config.observability!.telemetry!.piiSecret = "tiny";
      expect(() => validatePiiSafety(config,)).toThrow(/Telemetry PII secret is only 4 characters/,);
    } finally {
      restore();
    }
  });

  test("error message includes the generation hint", () => {
    const restore = withEnv({ NODE_ENV: "production", },);
    try {
      const config = freshConfig();
      config.nsfw.piiSecret = "x";
      config.nsfw.reporterHashSecret = LONG;
      config.observability!.telemetry!.piiSecret = LONG;
      expect(() => validatePiiSafety(config,)).toThrow(/openssl rand -base64 48/,);
    } finally {
      restore();
    }
  });
});
