// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the server provider descriptor — the persisted, non-secret shape
 * of a stored provider instance: name rules, host approval, key layout and the
 * parse of a stored row.
 */
import { describe, expect, test, } from "bun:test";
import {
  assertValidServerProviderName,
  descriptorNameFromKey,
  parseStoredServerProvider,
  resolveApprovedHosts,
  serverProviderDescriptorKey,
  serverProviderSecretKey,
  ServerProviderValidationError,
} from "./server-provider-descriptor";

describe("assertValidServerProviderName", () => {
  test("accepts a slug-ish name", () => {
    expect(() => assertValidServerProviderName("acme-1",)).not.toThrow();
  });

  test("rejects a name with a space and says why", () => {
    expect(() => assertValidServerProviderName("bad name",)).toThrow(/Invalid provider name "bad name"/,);
  });

  test("rejects a name that does not start with a letter or digit", () => {
    expect(() => assertValidServerProviderName("-acme",)).toThrow(ServerProviderValidationError,);
  });

  test("rejects a name longer than 64 characters", () => {
    expect(() => assertValidServerProviderName("a".repeat(65,),)).toThrow(/max 64 characters/,);
  });
});

describe("resolveApprovedHosts", () => {
  test("approves the URL's own host when the operator gave no list", () => {
    expect(resolveApprovedHosts("https://api.example.com/v1",),).toEqual(["api.example.com",],);
  });

  test("keeps the operator's explicit approval", () => {
    expect(resolveApprovedHosts("https://api.example.com/v1", ["api.example.com", "cdn.example.com",],),).toEqual([
      "api.example.com",
      "cdn.example.com",
    ],);
  });

  test("rejects a metadata target host", () => {
    expect(() => resolveApprovedHosts("http://169.254.169.254/latest/meta-data/",)).toThrow(
      /link-local or cloud-metadata target/,
    );
  });

  test("rejects an approval entry that carries a scheme", () => {
    expect(() => resolveApprovedHosts("https://api.example.com/v1", ["https://api.example.com",],)).toThrow(
      /bare hostname without scheme/,
    );
  });

  test("rejects an approval entry that carries a port", () => {
    expect(() => resolveApprovedHosts("https://api.example.com/v1", ["api.example.com:8443",],)).toThrow(
      /a port is not part of a host approval/,
    );
  });

  test("rejects a URL that is not http(s)", () => {
    expect(() => resolveApprovedHosts("ftp://api.example.com/v1",)).toThrow(/must use http or https/,);
  });

  test("rejects a URL that cannot be parsed", () => {
    expect(() => resolveApprovedHosts("not-a-url",)).toThrow(/Invalid provider URL/,);
  });
});

describe("parseStoredServerProvider", () => {
  test("fills the defaults of a stored descriptor", () => {
    expect(parseStoredServerProvider(JSON.stringify({
      name: "acme",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
    },),),).toEqual({
      name: "acme",
      label: "acme",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      allowedHosts: [],
      timeout: 30_000,
      retries: 3,
      allowUserApiKey: true,
      setDefault: false,
    },);
  });

  test("keeps the stored overrides", () => {
    const stored = parseStoredServerProvider(JSON.stringify({
      name: "acme",
      label: "Acme Cloud",
      baseUrl: "https://api.example.com/v1",
      model: "demo-model",
      allowedHosts: ["api.example.com",],
      timeout: 5_000,
      retries: 1,
      allowUserApiKey: false,
      setDefault: true,
    },),);

    expect(stored?.label,).toBe("Acme Cloud",);
    expect(stored?.allowedHosts,).toEqual(["api.example.com",],);
    expect(stored?.timeout,).toBe(5_000,);
    expect(stored?.retries,).toBe(1,);
    expect(stored?.allowUserApiKey,).toBe(false,);
    expect(stored?.setDefault,).toBe(true,);
  });

  test("returns null for a malformed row", () => {
    expect(parseStoredServerProvider("{not json",),).toBeNull();
  });

  test("returns null when a required field is missing", () => {
    expect(parseStoredServerProvider(JSON.stringify({
      name: "acme",
      baseUrl: "https://api.example.com/v1",
    },),),).toBeNull();
  });
});

describe("descriptorNameFromKey", () => {
  test("reads the instance name out of a descriptor key", () => {
    expect(descriptorNameFromKey(serverProviderDescriptorKey("acme",),),).toBe("acme",);
  });

  test("a secret key does not name a descriptor", () => {
    expect(descriptorNameFromKey(serverProviderSecretKey("acme",),),).toBeNull();
  });

  test("an unrelated key does not name a descriptor", () => {
    expect(descriptorNameFromKey("default_provider",),).toBeNull();
  });
});
