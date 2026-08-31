/**
 * URL Validation Tests — SSRF protection
 */

import { describe, expect, it, } from "bun:test";
import { validateProviderUrl, validateProviderUrls, } from "../url-validation";

describe("validateProviderUrl", () => {
  describe("valid URLs", () => {
    it("allows localhost by default", () => {
      const result = validateProviderUrl("http://localhost:11434/api",);
      expect(result.ok,).toBe(true,);
      expect(result.local,).toBe(true,);
    });

    it("allows 127.0.0.1 by default", () => {
      const result = validateProviderUrl("http://127.0.0.1:8080",);
      expect(result.ok,).toBe(true,);
      expect(result.local,).toBe(true,);
    });

    it("allows 10.x.x.x private IPs", () => {
      const result = validateProviderUrl("http://10.0.0.1:3000",);
      expect(result.ok,).toBe(true,);
      expect(result.local,).toBe(true,);
    });

    it("allows 172.16.x.x private IPs", () => {
      const result = validateProviderUrl("http://172.16.0.1:8080",);
      expect(result.ok,).toBe(true,);
      expect(result.local,).toBe(true,);
    });

    it("allows 192.168.x.x private IPs", () => {
      const result = validateProviderUrl("http://192.168.1.100:5000",);
      expect(result.ok,).toBe(true,);
      expect(result.local,).toBe(true,);
    });

    it("allows localhost.local", () => {
      const result = validateProviderUrl("https://localhost.local:8080",);
      expect(result.ok,).toBe(true,);
      expect(result.local,).toBe(true,);
    });
  });

  describe("allowlist", () => {
    it("allows exact hostname match", () => {
      const result = validateProviderUrl("https://api.openai.com/v1", {
        allowlist: ["api.openai.com",],
      },);
      expect(result.ok,).toBe(true,);
      expect(result.local,).toBe(false,);
    });

    it("allows wildcard suffix match", () => {
      const result = validateProviderUrl("https://sub.example.com/api", {
        allowlist: ["*.example.com",],
      },);
      expect(result.ok,).toBe(true,);
      expect(result.local,).toBe(false,);
    });

    it("rejects hostname not in allowlist", () => {
      const result = validateProviderUrl("https://evil.com/steal", {
        allowlist: ["api.openai.com",],
      },);
      expect(result.ok,).toBe(false,);
      expect(result.error,).toContain("not in allowlist",);
    });
  });

  describe("blockLocalAddrs", () => {
    it("blocks localhost when blockLocalAddrs=true", () => {
      const result = validateProviderUrl("http://localhost:8080", {
        blockLocalAddrs: true,
      },);
      expect(result.ok,).toBe(false,);
      expect(result.local,).toBe(true,);
      expect(result.error,).toContain("blocked",);
    });

    it("blocks 127.0.0.1 when blockLocalAddrs=true", () => {
      const result = validateProviderUrl("http://127.0.0.1:8080", {
        blockLocalAddrs: true,
      },);
      expect(result.ok,).toBe(false,);
      expect(result.local,).toBe(true,);
    });

    it("blocks 10.x.x.x when blockLocalAddrs=true", () => {
      const result = validateProviderUrl("http://10.0.0.1:8080", {
        blockLocalAddrs: true,
      },);
      expect(result.ok,).toBe(false,);
      expect(result.local,).toBe(true,);
    });

    it("allows allowlisted hostname when blockLocalAddrs=true", () => {
      const result = validateProviderUrl("https://api.openai.com/v1", {
        blockLocalAddrs: true,
        allowlist: ["api.openai.com",],
      },);
      expect(result.ok,).toBe(true,);
    });
  });

  describe("scheme validation", () => {
    it("allows http and https by default", () => {
      expect(validateProviderUrl("http://localhost",).ok,).toBe(true,);
      expect(validateProviderUrl("https://localhost",).ok,).toBe(true,);
    });

    it("rejects ftp scheme", () => {
      const result = validateProviderUrl("ftp://localhost/file",);
      expect(result.ok,).toBe(false,);
      expect(result.error,).toContain("Scheme",);
    });

    it("allows custom schemes", () => {
      const result = validateProviderUrl("ws://localhost:8080", {
        allowedSchemes: ["ws", "wss",],
      },);
      expect(result.ok,).toBe(true,);
    });
  });

  describe("invalid URLs", () => {
    it("rejects empty string", () => {
      const result = validateProviderUrl("",);
      expect(result.ok,).toBe(false,);
      expect(result.error,).toContain("Invalid URL",);
    });

    it("rejects malformed URL", () => {
      const result = validateProviderUrl("not-a-url",);
      expect(result.ok,).toBe(false,);
    });
  });

  describe("remote IPs", () => {
    it("rejects remote IP not in allowlist", () => {
      const result = validateProviderUrl("http://8.8.8.8:53",);
      expect(result.ok,).toBe(false,);
      expect(result.local,).toBe(false,);
      expect(result.error,).toContain("Remote IP",);
    });

    it("allows remote IP in allowlist", () => {
      const result = validateProviderUrl("http://8.8.8.8:53", {
        allowlist: ["8.8.8.8",],
      },);
      expect(result.ok,).toBe(true,);
    });
  });
});

describe("validateProviderUrls", () => {
  it("validates multiple URLs at once", () => {
    const results = validateProviderUrls([
      { name: "ollama", url: "http://localhost:11434", },
      { name: "openai", url: "https://api.openai.com/v1", },
    ], {
      allowlist: ["api.openai.com",],
    },);

    expect(results.ollama?.ok,).toBe(true,);
    expect(results.openai?.ok,).toBe(true,);
  });

  it("returns results for all entries", () => {
    const results = validateProviderUrls([
      { name: "a", url: "http://localhost", },
      { name: "b", url: "http://localhost:3000", },
      { name: "c", url: "http://localhost:5000", },
    ],);

    expect(Object.keys(results,).length,).toBe(3,);
  });
});
