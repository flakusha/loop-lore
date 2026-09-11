// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for content decoding (identity, empty, corrupt input). */
import { describe, expect, test, } from "bun:test";
import { decodeContent, } from "./decode";
import { encodeContent, } from "./encode";

describe("decodeContent", () => {
  test("identity returns the stored string as-is", () => {
    expect(decodeContent("raw-stored", "identity",),).toBe("raw-stored",);
  });

  test("empty stored short-circuits regardless of encoding", () => {
    expect(decodeContent("", "gzip",),).toBe("",);
  });

  test("rejects non-base64 input", () => {
    expect(() => decodeContent("!!! not base64 !!!", "gzip",),).toThrow();
  });

  test("rejects a payload compressed with the wrong codec", () => {
    const gzip = encodeContent("hello world".repeat(10,), "gzip",);
    expect(() => decodeContent(gzip.encoded, "brotli",),).toThrow();
  });
});
