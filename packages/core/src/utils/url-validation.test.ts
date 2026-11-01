import { describe, expect, it, } from "bun:test";
import { validateFetchUrl, validateProviderUrl, validateProviderUrls, } from "./url-validation";

describe("url-validation (real logic)", () => {
  it("allows 127.0.0.1 by default", () => {
    const r = validateProviderUrl("http://127.0.0.1:8080/path",);
    expect(r.ok,).toBe(true,);
    expect(r.local,).toBe(true,);
  });

  it("allows 10.x.x.x private range", () => {
    const r = validateProviderUrl("http://10.0.5.1/",);
    expect(r.ok,).toBe(true,);
    expect(r.local,).toBe(true,);
  });

  it("allows 192.168.x.x private range", () => {
    const r = validateProviderUrl("http://192.168.1.99/",);
    expect(r.ok,).toBe(true,);
    expect(r.local,).toBe(true,);
  });

  it("blocks unknown scheme", () => {
    const r = validateProviderUrl("ftp://127.0.0.1/",);
    expect(r.ok,).toBe(false,);
    expect(r.error,).toContain("Scheme",);
  });

  it("blocks unallowlisted remote host", () => {
    const r = validateProviderUrl("https://api.unknown.com/",);
    expect(r.ok,).toBe(false,);
    expect(r.error,).toContain("not in allowlist",);
  });

  it("allows remote host in allowlist", () => {
    const r = validateProviderUrl("https://api.openai.com/v1/", { allowlist: ["api.openai.com",], },);
    expect(r.ok,).toBe(true,);
    expect(r.local,).toBe(false,);
  });

  it("allows wildcard allowlist *.example.com", () => {
    const r = validateProviderUrl("https://chat.example.com/", { allowlist: ["*.example.com",], },);
    expect(r.ok,).toBe(true,);
  });

  it("blocks invalid URL", () => {
    const r = validateProviderUrl("not-a-url",);
    expect(r.ok,).toBe(false,);
    expect(r.error,).toContain("Invalid URL",);
  });

  it("validateProviderUrls batches multiple entries", () => {
    const results = validateProviderUrls([
      { name: "local", url: "http://localhost/", },
      { name: "remote", url: "https://bad.host/", },
    ],);

    expect(results["local"]?.ok,).toBe(true,);
    expect(results["remote"]?.ok,).toBe(false,);
  });
});

describe("validateFetchUrl (server-side fetch of a user-supplied URL)", () => {
  const resolvingTo = (addresses: string[],) => () => Promise.resolve(addresses,);

  it("blocks a literal loopback address", async () => {
    const r = await validateFetchUrl("http://127.0.0.1:8080/x",);
    expect(r.ok,).toBe(false,);
    expect(r.local,).toBe(true,);
  });

  it("blocks a literal 169.254.169.254 metadata address", async () => {
    const r = await validateFetchUrl("http://169.254.169.254/latest/meta-data/",);
    expect(r.ok,).toBe(false,);
  });

  it("blocks a public hostname that resolves to a private address", async () => {
    // The defect: a hostname string check alone cannot see this.
    const r = await validateFetchUrl("https://totally-public.example.com/card.json", {
      resolve: resolvingTo(["10.1.2.3",],),
    },);

    expect(r.ok,).toBe(false,);
    expect(r.error,).toContain("10.1.2.3",);
  });

  it("blocks a public hostname resolving to cloud metadata", async () => {
    const r = await validateFetchUrl("https://metadata.example.com/", {
      resolve: resolvingTo(["169.254.169.254",],),
    },);

    expect(r.ok,).toBe(false,);
  });

  it("blocks when ANY resolved address is private", async () => {
    const r = await validateFetchUrl("https://mixed.example.com/", {
      resolve: resolvingTo(["93.184.216.34", "192.168.1.5",],),
    },);

    expect(r.ok,).toBe(false,);
  });

  it("blocks IPv6 unique-local fc00::/7", async () => {
    const r = await validateFetchUrl("https://[fd00::1]/x",);
    expect(r.ok,).toBe(false,);
  });

  it("blocks IPv6 link-local fe80::/10", async () => {
    const r = await validateFetchUrl("https://[fe80::1]/x",);
    expect(r.ok,).toBe(false,);
  });

  it("blocks an IPv4-mapped IPv6 private address", async () => {
    const r = await validateFetchUrl("https://[::ffff:10.0.0.1]/x",);
    expect(r.ok,).toBe(false,);
  });

  it("allows a hostname resolving only to public addresses", async () => {
    const r = await validateFetchUrl("https://cards.example.com/x.json", {
      resolve: resolvingTo(["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946",],),
    },);

    expect(r.ok,).toBe(true,);
  });

  it("does not false-positive on a hostname merely starting with 10.", async () => {
    const r = await validateFetchUrl("http://10x.example.com/", {
      resolve: resolvingTo(["93.184.216.34",],),
    },);

    expect(r.ok,).toBe(true,);
  });

  it("fails closed when DNS resolution fails", async () => {
    const r = await validateFetchUrl("https://nope.invalid/", {
      resolve: () => Promise.reject(new Error("NXDOMAIN",),),
    },);

    expect(r.ok,).toBe(false,);
  });

  it("fails closed when the hostname resolves to nothing", async () => {
    const r = await validateFetchUrl("https://empty.example.com/", { resolve: resolvingTo([],), },);
    expect(r.ok,).toBe(false,);
  });

  it("rejects non-http(s) schemes", async () => {
    const schemes = ["file:///etc/passwd", "ftp://example.com/x", "gopher://example.com/",];
    for (const url of schemes) {
      const r = await validateFetchUrl(url,);
      expect(r.ok,).toBe(false,);
    }
  });
});
