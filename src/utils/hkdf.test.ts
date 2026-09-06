// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { domainKey, hashWithDomain, DOMAIN_INFO } from "./hkdf";

describe("hkdf", () => {
  test("domainKey creates a domain-derived key", async () => {
    const key = await domainKey("test-domain", "secret", 32);
    expect(typeof key).toBe("object");
    expect(key.length).toBeGreaterThan(0);
  });
  test("hashWithDomain hashes with domain info", async () => {
    const hash = await hashWithDomain("test", "secret");
    expect(typeof hash).toBe("string");
  });
  test("DOMAIN_INFO is defined", () => {
    expect(DOMAIN_INFO).toBeDefined();
  });
});
