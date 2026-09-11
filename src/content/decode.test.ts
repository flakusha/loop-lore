// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Decode error paths (happy paths live in encode-decode.test.ts). */
import { describe, expect, test, } from "bun:test";
import { decodeContent, } from "./decode";
import { encodeContent, } from "./encode";

describe("decodeContent error paths", () => {
  test("rejects non-base64 input", () => {
    expect(() => decodeContent("!!! not base64 !!!", "gzip",),).toThrow();
  });

  test("rejects a payload compressed with the wrong codec", () => {
    const gzip = encodeContent("hello world".repeat(10,), "gzip",);
    expect(() => decodeContent(gzip.encoded, "brotli",),).toThrow();
  });
});
