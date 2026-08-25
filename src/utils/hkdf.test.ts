// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { DOMAIN_INFO, domainKey, } from "./hkdf";

describe("domainKey (HKDF-SHA256)", () => {
  it("produces a key of the requested length", async () => {
    const k = await domainKey("a".repeat(48,), DOMAIN_INFO.JWT_SIGNING, 32,);
    expect(k.length,).toBe(32,);
  });

  it("is deterministic for the same (secret, info)", async () => {
    const a = await domainKey("shared-secret-1234", "test-domain",);
    const b = await domainKey("shared-secret-1234", "test-domain",);
    expect(a,).toEqual(b,);
  });

  it("produces different subkeys for different `info` with the same secret", async () => {
    // The whole point of domain separation: two consumers of the same secret
    // must derive independent keys. If they collide, the consumer can
    // impersonate the other.
    const jwt = await domainKey("shared-secret-1234", DOMAIN_INFO.JWT_SIGNING,);
    const assets = await domainKey("shared-secret-1234", DOMAIN_INFO.ASSETS_SIGNED_URL,);
    const pii = await domainKey("shared-secret-1234", DOMAIN_INFO.NSFW_PII,);
    expect(jwt,).not.toEqual(assets,);
    expect(jwt,).not.toEqual(pii,);
    expect(assets,).not.toEqual(pii,);
  });

  it("rejects empty secret", async () => {
    await expect(domainKey("", "test",),).rejects.toThrow(/non-empty/,);
  });

  it("rejects empty info", async () => {
    await expect(domainKey("secret-1234", "",),).rejects.toThrow(/non-empty/,);
  });
});
