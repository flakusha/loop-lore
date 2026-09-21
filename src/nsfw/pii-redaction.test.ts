// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for NSFW PII redaction module.
 *
 * BUG-pii-redaction-hardcoded-dev-fallback-secret-no-prod-guard:
 *   `NSFW_PII_SECRET` unset must throw in production (NODE_ENV ∈ {production,
 *   staging, anything not explicitly development/test/dev}).
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";

const ORIGINAL_NODE_ENV = process.env["NODE_ENV"];
const ORIGINAL_SECRET = process.env["NSFW_PII_SECRET"];

describe("NSFW PII redaction secret resolution", () => {
  beforeEach(async () => {
    delete process.env["NSFW_PII_SECRET"];
    const { resetNsfwPiiSecretCache, } = await import("./pii-redaction");
    resetNsfwPiiSecretCache();
  },);

  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = ORIGINAL_NODE_ENV;
    }
    if (ORIGINAL_SECRET === undefined) {
      delete process.env["NSFW_PII_SECRET"];
    } else {
      process.env["NSFW_PII_SECRET"] = ORIGINAL_SECRET;
    }
  },);

  it("throws when NSFW_PII_SECRET unset and NODE_ENV=production", async () => {
    process.env["NODE_ENV"] = "production";
    const { hashId, resetNsfwPiiSecretCache, } = await import("./pii-redaction");
    resetNsfwPiiSecretCache();
    await expect(hashId("user-1",),).rejects.toThrow(/NSFW_PII_SECRET is required/,);
  });

  it("throws when NSFW_PII_SECRET unset and NODE_ENV=staging", async () => {
    process.env["NODE_ENV"] = "staging";
    const { hashId, resetNsfwPiiSecretCache, } = await import("./pii-redaction");
    resetNsfwPiiSecretCache();
    await expect(hashId("user-1",),).rejects.toThrow(/NSFW_PII_SECRET is required/,);
  });

  it("throws when NSFW_PII_SECRET unset and NODE_ENV is unset (default = production-like)", async () => {
    delete process.env["NODE_ENV"];
    const { hashId, resetNsfwPiiSecretCache, } = await import("./pii-redaction");
    resetNsfwPiiSecretCache();
    await expect(hashId("user-1",),).rejects.toThrow(/NSFW_PII_SECRET is required/,);
  });

  it("uses env NSFW_PII_SECRET when set, regardless of NODE_ENV", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["NSFW_PII_SECRET"] = "a".repeat(48,);
    const { hashId, resetNsfwPiiSecretCache, } = await import("./pii-redaction");
    resetNsfwPiiSecretCache();
    await expect(hashId("user-1",),).resolves.toMatch(/^[0-9a-f]{64}$/,);
  });

  it("prefers merged-Config secret over process.env", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["NSFW_PII_SECRET"] = "e".repeat(48,);
    const { hashId, resetNsfwPiiSecretCache, } = await import("./pii-redaction");
    resetNsfwPiiSecretCache();
    const fromEnv = await hashId("user-1",);
    const fromConfig = await hashId("user-1", "c".repeat(48,),);
    expect(fromConfig,).toMatch(/^[0-9a-f]{64}$/,);
    expect(fromConfig,).not.toBe(fromEnv,);
  });
});
