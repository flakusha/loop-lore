// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/service/validate.ts — upload size and MIME gates.
 */

import { describe, expect, test, } from "bun:test";
import { validateFileSize, validateMimeType, } from "./validate";

describe("validateFileSize", () => {
  const MAX = 10 * 1_048_576; // 10 MB

  test("accepts sizes within the limit", () => {
    expect(validateFileSize(0, MAX,),).toBeNull();
    expect(validateFileSize(1, MAX,),).toBeNull();
    expect(validateFileSize(MAX, MAX,),).toBeNull();
  });

  test("rejects sizes above the limit with a MB-rounded message", () => {
    const err = validateFileSize(MAX + 1, MAX,);
    expect(err,).toBe("File too large. Maximum size is 10 MB.",);
  });

  test("rounds the limit down to whole MB in the message", () => {
    // 1.2 MB limit → message says "1 MB" (toFixed rounding)
    const oddMax = Math.floor(1.2 * 1_048_576,);
    expect(validateFileSize(oddMax + 1, oddMax,),).toBe(
      "File too large. Maximum size is 1 MB.",
    );
  });

  test("zero limit rejects any positive size", () => {
    expect(validateFileSize(1, 0,),).toBe("File too large. Maximum size is 0 MB.",);
    expect(validateFileSize(0, 0,),).toBeNull();
  });
});

describe("validateMimeType", () => {
  test("accepts allowed prefixes", () => {
    expect(validateMimeType("image/png",),).toBeNull();
    expect(validateMimeType("image/jpeg",),).toBeNull();
    expect(validateMimeType("audio/ogg",),).toBeNull();
    expect(validateMimeType("video/mp4",),).toBeNull();
    expect(validateMimeType("application/pdf",),).toBeNull();
    expect(validateMimeType("text/plain",),).toBeNull();
    expect(validateMimeType("application/json",),).toBeNull();
  });

  test("acceptance is case-insensitive", () => {
    expect(validateMimeType("IMAGE/PNG",),).toBeNull();
    expect(validateMimeType("Application/PDF",),).toBeNull();
  });

  test("rejects active formats (SVG) outright, regardless of case", () => {
    expect(validateMimeType("image/svg+xml",),).toBe("Unsupported file type: image/svg+xml",);
    expect(validateMimeType("IMAGE/SVG+XML",),).toBe("Unsupported file type: IMAGE/SVG+XML",);
  });

  test("rejects disallowed families", () => {
    expect(validateMimeType("text/html",),).toBe("Unsupported file type: text/html",);
    expect(validateMimeType("application/zip",),).toBe("Unsupported file type: application/zip",);
    expect(validateMimeType("application/octet-stream",),).toBe(
      "Unsupported file type: application/octet-stream",
    );
  });

  test("rejects empty and lookalike MIME types", () => {
    expect(validateMimeType("",),).toBe("Unsupported file type: ",);
    expect(validateMimeType("image",),).toBe("Unsupported file type: image",);
    expect(validateMimeType("images/svg+xml",),).toBe("Unsupported file type: images/svg+xml",);
  });

  test("blocked check wins over allowed prefixes", () => {
    // "image/svg+xml" starts with "image/" but must still be blocked
    expect(validateMimeType("image/svg+xml",),).not.toBeNull();
  });
});
