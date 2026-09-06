import { describe, expect, it, } from "bun:test";
import { validateProviderUrl, validateProviderUrls, } from "./url-validation";

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
