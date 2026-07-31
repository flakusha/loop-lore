import { describe, expect, it, } from "bun:test";
import { CSRF_TOKEN, LL_LOCALE, LL_TOKEN, } from "./cookies";

describe("cookies regex", () => {
  describe("LL_TOKEN", () => {
    it("extracts token from cookie string", () => {
      const cookie = "ll_token=abc123def; other=value";
      expect(LL_TOKEN.exec(cookie,)?.[1],).toBe("abc123def",);
    });

    it("extracts token at start of cookie string", () => {
      const cookie = "ll_token=xyz789";
      expect(LL_TOKEN.exec(cookie,)?.[1],).toBe("xyz789",);
    });

    it("extracts token with spaces after semicolon", () => {
      const cookie = "other=value; ll_token=mytoken";
      expect(LL_TOKEN.exec(cookie,)?.[1],).toBe("mytoken",);
    });

    it("returns null for missing token", () => {
      expect(LL_TOKEN.exec("other=value",),).toBeNull();
    });
  });

  describe("LL_LOCALE", () => {
    it("extracts 2-letter locale", () => {
      const cookie = "ll_locale=en";
      expect(LL_LOCALE.exec(cookie,)?.[1],).toBe("en",);
    });

    it("extracts locale from cookie string", () => {
      const cookie = "ll_token=abc; ll_locale=fr";
      expect(LL_LOCALE.exec(cookie,)?.[1],).toBe("fr",);
    });

    it("returns null for missing locale", () => {
      expect(LL_LOCALE.exec("other=value",),).toBeNull();
    });
  });

  describe("CSRF_TOKEN", () => {
    it("extracts CSRF token", () => {
      const cookie = "csrf_token=tok123";
      expect(CSRF_TOKEN.exec(cookie,)?.[1],).toBe("tok123",);
    });

    it("extracts from multiple cookies", () => {
      const cookie = "session=abc; csrf_token=mytoken; lang=en";
      expect(CSRF_TOKEN.exec(cookie,)?.[1],).toBe("mytoken",);
    });

    it("returns null for missing token", () => {
      expect(CSRF_TOKEN.exec("session=abc",),).toBeNull();
    });
  });
});
