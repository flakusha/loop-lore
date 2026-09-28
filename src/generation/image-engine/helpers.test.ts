// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { SafeBufferError, } from "../../utils/safe-buffer";
import { decodeB64, decodeImages, failure, ok, } from "./helpers";

describe("image-engine helpers", () => {
  test("failure builds a not-ok result with error and status", () => {
    expect(failure("boom", 500,),).toEqual({ ok: false, error: "boom", status: 500, },);
  });

  test("ok builds a success result carrying images and mime type", () => {
    const images = [Buffer.from("a",), Buffer.from("b",),];
    const result = ok(images, "image/png",);
    expect(result.ok,).toBe(true,);
    expect(result.images,).toBe(images,);
    expect(result.mimeType,).toBe("image/png",);
  });

  test("decodeB64 round-trips valid base64", () => {
    expect(decodeB64(Buffer.from("hi",).toString("base64",),).toString(),).toBe("hi",);
  });

  test("decodeB64 throws on undecodable provider data instead of returning 0 bytes", () => {
    // A 0-byte "image" persisted as a broken asset while reporting success.
    expect(() => decodeB64("!!!not-base64!!!",)).toThrow(SafeBufferError,);
    expect(() => decodeB64("",)).toThrow(SafeBufferError,);
  });

  test("decodeImages returns decoded buffers on success", () => {
    const a = Buffer.from("hi",).toString("base64",);
    const b = Buffer.from("yo",).toString("base64",);
    const outcome = decodeImages([a, b,], "image/png",);
    expect(outcome.ok,).toBe(true,);
    if (outcome.ok) {
      expect(outcome.images.map((i,) => i.toString()),).toEqual(["hi", "yo",],);
      expect(outcome.mimeType,).toBe("image/png",);
    }
  });

  test("decodeImages converts the throw into a failure outcome, not a 0-byte image", () => {
    // A single bad element must fail the whole batch rather than yielding a
    // short images array that the caller persists as a successful generation.
    const good = Buffer.from("hi",).toString("base64",);
    const outcome = decodeImages([good, "!!!not-base64!!!",], "image/png",);
    expect(outcome.ok,).toBe(false,);
    if (!outcome.ok) {
      expect(outcome.status,).toBe(502,);
      expect(outcome.error,).toMatch(/Image generation failed/,);
    }
  });

  test("decodeImages reports an empty provider list as an empty success", () => {
    const outcome = decodeImages([], "image/png",);
    expect(outcome.ok,).toBe(true,);
    if (outcome.ok) { expect(outcome.images,).toHaveLength(0,); }
  });
});
