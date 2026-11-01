import { describe, expect, test, } from "bun:test";
import { mustFromBase64, mustFromBase64Url, safeFromBase64, safeFromBase64Url, } from "./base64";
import { DEFAULT_MAX_BASE64_LEN, DEFAULT_MAX_SIZE, } from "./constants";
import { mustFromString, mustFromUint8Array, safeFromString, safeFromUint8Array, } from "./string";
import { SafeBufferError, } from "./types";

/** Every ASCII whitespace class `Uint8Array.fromBase64` would silently strip. */
const WHITESPACE_CLASSES = [
  ["space", " ",],
  ["tab", "\t",],
  ["LF", "\n",],
  ["CRLF", "\r\n",],
  ["VT", "\v",],
  ["FF", "\f",],
] as const;

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

  test("the per-call cap rejects an encoded payload before decoding it", () => {
    // 1 MB of valid base64 chars decodes to ~750 KB. The trailing `!` is
    // outside the alphabet, so a guard that decoded first would report a
    // decode error; only the length pre-check can produce this message.
    const payload = `${"A".repeat(1_000_000,)}!`;
    const r = safeFromBase64Url(payload, 512,);
    expect(r.ok,).toBe(false,);
    if (!r.ok) { expect(r.error.message,).toMatch(/^Base64 input too large:/,); }
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

describe("guards reject whitespace instead of normalizing it away", () => {
  const CANONICAL_URL = Buffer.from("hello world",).toString("base64url",);
  const CANONICAL_B64 = Buffer.from("hello world",).toString("base64",);

  for (const [label, ws,] of WHITESPACE_CLASSES) {
    test(`safeFromBase64Url rejects a cursor carrying ${label}`, () => {
      const shaped = [
        `${ws}${CANONICAL_URL}`,
        `${CANONICAL_URL}${ws}`,
        `${CANONICAL_URL.slice(0, 4,)}${ws}${CANONICAL_URL.slice(4,)}`,
      ];

      for (const candidate of shaped) {
        const r = safeFromBase64Url(candidate,);
        expect(r.ok,).toBe(false,);
        if (!r.ok) { expect(r.error.message,).toBe("Base64 input contains whitespace",); }
      }
    });

    test(`safeFromBase64 rejects a payload carrying ${label}`, () => {
      const r = safeFromBase64(`${CANONICAL_B64}${ws}`,);
      expect(r.ok,).toBe(false,);
      if (!r.ok) { expect(r.error.message,).toBe("Base64 input contains whitespace",); }
    });
  }

  test("a non-finite or negative cap falls back to the default instead of disabling the guard", () => {
    // `Math.ceil(NaN / 3) * 4` is NaN and every comparison against NaN is
    // false, so deriving both bounds from a raw `maxSize` would leave the
    // guard with no limit at all. These payloads exceed DEFAULT_MAX_SIZE, so
    // a working fallback must reject them.
    const oversized = Buffer.alloc(12_000_000, 0x41,).toString("base64",);
    expect(oversized.length,).toBeGreaterThan(DEFAULT_MAX_SIZE,);
    for (const cap of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0,]) {
      const r = safeFromBase64(oversized, cap,);
      expect(r.ok, `cap ${String(cap,)} must not disable the guard`,).toBe(false,);
      if (!r.ok) { expect(r.error.message,).toMatch(/too large/,); }
    }
  });

  test("a non-finite cap still admits payloads that fit the default", () => {
    // The fallback must not become a blanket reject: a 1 KB payload is fine
    // under the 10 MB default regardless of what the caller passed.
    const r = safeFromBase64(Buffer.alloc(1024, 0x41,).toString("base64",), Number.NaN,);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.buffer.length,).toBe(1024,); }
  });

  test("a caller cannot lift the work bound past the global encoded ceiling", () => {
    const r = safeFromBase64("A".repeat(DEFAULT_MAX_BASE64_LEN + 1,), Number.MAX_SAFE_INTEGER,);
    expect(r.ok,).toBe(false,);
    if (!r.ok) { expect(r.error.message,).toBe(`Base64 input too large: ${DEFAULT_MAX_BASE64_LEN + 1} chars`,); }
  });

  test("a payload sized exactly at the default cap is still accepted", () => {
    // Guards the work bound against being one group too tight: the default
    // cap must still admit a full-size payload, or this is a data-loss bug
    // disguised as a DoS fix.
    const full = Buffer.alloc(DEFAULT_MAX_SIZE, 0x41,).toString("base64",);
    const r = safeFromBase64(full,);
    expect(r.ok,).toBe(true,);
    if (r.ok) { expect(r.buffer.length,).toBe(DEFAULT_MAX_SIZE,); }
  });

  test("the undecorated canonical forms are still accepted", () => {
    expect(safeFromBase64Url(CANONICAL_URL,).ok,).toBe(true,);
    expect(safeFromBase64(CANONICAL_B64,).ok,).toBe(true,);
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
