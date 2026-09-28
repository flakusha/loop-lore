import { describe, expect, test, } from "bun:test";
import { mustFromBase64, mustFromBase64Url, safeFromBase64, safeFromBase64Url, } from "./base64";
import { mustFromString, mustFromUint8Array, safeFromString, safeFromUint8Array, } from "./string";
import { SafeBufferError, } from "./types";

describe("base64url round-trip covers every byte value", () => {
  test("all 256 byte values survive toString(base64url) then safeFromBase64Url", () => {
    const failures: string[] = [];
    for (let i = 0; i < 256; i++) {
      const original = Buffer.from([i,],);
      const encoded = original.toString("base64url",);
      const r = safeFromBase64Url(encoded,);
      if (!r.ok) {
        failures.push(`byte ${i} (${encoded}): ${r.error.message}`,);
        continue;
      }
      if (!r.buffer.equals(original,)) {
        failures.push(`byte ${i} (${encoded}): got ${r.buffer.toString("hex",)}`,);
      }
    }
    expect(failures,).toEqual([],);
  });

  test("all 256 byte values survive mustFromBase64Url", () => {
    for (let i = 0; i < 256; i++) {
      const original = Buffer.from([i,],);
      const decoded = mustFromBase64Url(original.toString("base64url",),);
      expect(decoded.equals(original,),).toBe(true,);
    }
  });

  test("a payload whose base64url form emits - and _ is actually decoded", () => {
    const buf = Buffer.from([0xfb, 0xff, 0xbe, 0xff, 0xef, 0xbe,],);
    const urlForm = buf.toString("base64url",);
    expect(urlForm,).toContain("-",);
    expect(urlForm,).toContain("_",);
    expect(mustFromBase64Url(urlForm,).equals(buf,),).toBe(true,);
  });

  test("multi-byte and random payloads round-trip", () => {
    const payloads = [
      Buffer.from([0xfb, 0xff, 0xbe,],),
      Buffer.from([0xff, 0xef, 0xbe,],),
      Buffer.from(Array.from({ length: 256, }, (_, i,) => i,),),
      Buffer.from(crypto.getRandomValues(new Uint8Array(4096,),),),
    ];
    for (const p of payloads) {
      expect(mustFromBase64Url(p.toString("base64url",),).equals(p,),).toBe(true,);
    }
  });

  test("padded and unpadded base64url decode alike", () => {
    const buf = Buffer.from("hello world",);
    const url = buf.toString("base64url",);
    // "hello world" needs one pad char in standard base64; base64url drops it.
    expect(url,).toBe("aGVsbG8gd29ybGQ",);
    expect(safeFromBase64Url(url,).ok,).toBe(true,);
    expect(safeFromBase64Url(`${url}=`,).ok,).toBe(true,);
    expect(mustFromBase64Url(`${url}=`,).equals(buf,),).toBe(true,);
  });

  test("safeFromBase64 still rejects the base64url alphabet", () => {
    const urlForm = Buffer.from([0xfb, 0xff, 0xbe, 0xff, 0xef, 0xbe,],).toString("base64url",);
    expect(safeFromBase64(urlForm,).ok,).toBe(false,);
    expect(safeFromBase64Url(urlForm,).ok,).toBe(true,);
  });

  test("safeFromBase64Url rejects malformed input rather than truncating", () => {
    expect(safeFromBase64Url("!!!not-base64!!!",).ok,).toBe(false,);
    expect(safeFromBase64Url("aGVsbG9v=",).ok,).toBe(false,);
  });
});

describe("mustFrom* throws the typed error", () => {
  test("carries the guarding operation and the underlying cause", () => {
    let caught: unknown;
    try {
      mustFromBase64("!!!not-base64!!!",);
    } catch (e) {
      caught = e;
    }
    expect(caught,).toBeInstanceOf(SafeBufferError,);
    const err = caught as SafeBufferError;
    expect(err.name,).toBe("SafeBufferError",);
    // The guard names itself; mustFromBase64 delegates to the same guard, so
    // the error points at the code that actually rejected the input.
    expect(err.operation,).toBe("safeFromBase64",);
    expect(err.cause,).toBeInstanceOf(Error,);
  });

  test("base64url variant throws on empty and oversized input", () => {
    expect(() => mustFromBase64Url("",)).toThrow(SafeBufferError,);
    expect(() => mustFromBase64Url("aGVsbG8=", 1,)).toThrow(/too large/,);
  });

  test("string variant encodes normally and throws over the cap", () => {
    expect(mustFromString("hello",).toString(),).toBe("hello",);
    expect(() => mustFromString("x".repeat(100,), "utf8", 10,)).toThrow(SafeBufferError,);
  });

  test("uint8array variant adopts bytes and throws over the cap", () => {
    expect(mustFromUint8Array(new Uint8Array([1, 2, 3,],),).length,).toBe(3,);
    expect(() => mustFromUint8Array(new Uint8Array(100,), 10,)).toThrow(SafeBufferError,);
  });
});

describe("one guard implementation, two shapes", () => {
  test("Result and throwing variants agree on every input class", () => {
    for (const input of ["", "aGVsbG8=", "!!!bad!!!", "aGVsbG8", "-_-_",]) {
      const asResult = safeFromBase64(input,);
      let threw = false;
      try {
        mustFromBase64(input,);
      } catch {
        threw = true;
      }
      expect(threw,).toBe(!asResult.ok,);
    }
  });

  test("safeFrom* never throws on hostile input", () => {
    for (const input of ["", "!!!bad!!!",]) {
      const r = safeFromBase64(input,);
      expect(r.ok,).toBe(false,);
    }
    expect(mustFromBase64("aGk=",).toString(),).toBe("hi",);
  });

  test("every guard error is the typed error, tagged with its operation", () => {
    const uint8 = safeFromUint8Array(new Uint8Array(10,), 5,);
    expect(uint8.ok,).toBe(false,);
    if (!uint8.ok) {
      expect(uint8.error,).toBeInstanceOf(SafeBufferError,);
      expect((uint8.error as SafeBufferError).operation,).toBe("safeFromUint8Array",);
    }

    const str = safeFromString("x".repeat(10,), "utf8", 5,);
    expect(str.ok,).toBe(false,);
    if (!str.ok) {
      expect(str.error,).toBeInstanceOf(SafeBufferError,);
      expect((str.error as SafeBufferError).operation,).toBe("safeFromString",);
    }

    const b64 = safeFromBase64("",);
    expect(b64.ok,).toBe(false,);
    if (!b64.ok) {
      expect((b64.error as SafeBufferError).operation,).toBe("safeFromBase64",);
    }
  });
});
