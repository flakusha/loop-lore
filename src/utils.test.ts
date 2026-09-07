// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { asError, assertNever, secureToken, toErrorMessage, uid, } from "./utils.ts";

describe("utils.ts", () => {
  describe("uid", () => {
    test("generates UUID string", () => {
      const id = uid();
      expect(typeof id,).toBe("string",);
      expect(id.length,).toBe(36,);
      expect(id,).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,);
    });
  });

  describe("secureToken", () => {
    test("generates 32-char hex string", () => {
      const token = secureToken();
      expect(typeof token,).toBe("string",);
      expect(token.length,).toBe(32,);
      expect(token,).toMatch(/^[0-9a-f]{32}$/,);
    });
  });

  describe("asError", () => {
    test("returns Error instance for Error input", () => {
      const err = new Error("test error",);
      expect(asError(err,),).toBe(err,);
    });

    test("wraps string in Error for non-Error input", () => {
      const result = asError("string error",);
      expect(result,).toBeInstanceOf(Error,);
      expect(result.message,).toBe("string error",);
    });
  });

  describe("toErrorMessage", () => {
    test("extracts message from Error", () => {
      const err = new Error("my error",);
      expect(toErrorMessage(err,),).toBe("my error",);
    });

    test("returns 'Unknown error' for non-Error input", () => {
      expect(toErrorMessage("failure",),).toBe("Unknown error",);
      expect(toErrorMessage(123,),).toBe("Unknown error",);
    });
  });

  describe("assertNever", () => {
    test("throws with unhandled case message", () => {
      expect(() => assertNever({ __brand: "unknown", } as never,)).toThrow("Unhandled case",);
    });
  });
});
