// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { decodeB64, failure, ok, } from "./helpers";

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

  test("decodeB64 returns an empty buffer for invalid input", () => {
    expect(decodeB64("!!!not-base64!!!",).length,).toBe(0,);
  });
});
