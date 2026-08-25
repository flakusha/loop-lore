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
  beforeEach(() => {
    delete process.env["NSFW_PII_SECRET"];
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

  it("throws when NSFW_PII_SECRET unset and NODE_ENV=production", () => {
    process.env["NODE_ENV"] = "production";
    expect(import(`./pii-redaction?env=prod-${Date.now()}`),).rejects.toThrow(
      /NSFW_PII_SECRET is required/,
    );
  });

  it("throws when NSFW_PII_SECRET unset and NODE_ENV=staging", () => {
    process.env["NODE_ENV"] = "staging";
    expect(import(`./pii-redaction?env=stage-${Date.now()}`),).rejects.toThrow(
      /NSFW_PII_SECRET is required/,
    );
  });

  it("throws when NSFW_PII_SECRET unset and NODE_ENV is unset (default = production-like)", () => {
    delete process.env["NODE_ENV"];
    expect(import(`./pii-redaction?env=unset-${Date.now()}`),).rejects.toThrow(
      /NSFW_PII_SECRET is required/,
    );
  });

  it("uses env NSFW_PII_SECRET when set, regardless of NODE_ENV", async () => {
    process.env["NODE_ENV"] = "production";
    process.env["NSFW_PII_SECRET"] = "a".repeat(48,);
    // Should NOT throw — env wins over the prod guard.
    const mod = await import(`./pii-redaction?env=set-${Date.now()}`).then((m,) => m);
    expect(typeof mod.hashId,).toBe("function",);
  });
});
