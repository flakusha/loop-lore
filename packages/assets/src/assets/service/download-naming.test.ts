// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { DOWNLOAD_NAMING_MODES, downloadFileName, normalizeNamingMode, } from "./download-naming";

const ASSET = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  filename: "my photo (1).png",
  created_at: "2026-11-20T05:30:00.000Z",
  content_hash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
};

describe("downloadFileName", () => {
  test("raw keeps the historical sanitized storage name", () => {
    expect(downloadFileName(ASSET, "raw",),).toBe("my_photo_1_.png",);
  });

  test("datetime prefixes the UTC stamp", () => {
    expect(downloadFileName(ASSET, "datetime",),).toBe("20261120053000_my_photo_1_.png",);
  });

  test("hash prefixes the content hash", () => {
    expect(downloadFileName(ASSET, "hash",),).toBe("abcdef01_my_photo_1_.png",);
  });

  test("datetime-hash combines both", () => {
    expect(downloadFileName(ASSET, "datetime-hash",),).toBe("20261120053000_abcdef01_my_photo_1_.png",);
  });

  test("null content hash (dedupe off) falls back to the asset id", () => {
    expect(downloadFileName({ ...ASSET, content_hash: null, }, "hash",),).toBe(
      "123e4567_my_photo_1_.png",
    );
  });
});

describe("DOWNLOAD_NAMING_MODES", () => {
  test("lists exactly the four supported modes", () => {
    expect([...DOWNLOAD_NAMING_MODES,],).toEqual(["raw", "datetime", "hash", "datetime-hash",],);
  });
});

describe("normalizeNamingMode", () => {
  test("unknown, null and undefined collapse to raw", () => {
    expect(normalizeNamingMode("gallery",),).toBe("raw",);
    expect(normalizeNamingMode(null,),).toBe("raw",);
    expect(normalizeNamingMode(undefined,),).toBe("raw",);
  });

  test("known modes pass through", () => {
    expect(normalizeNamingMode("datetime-hash",),).toBe("datetime-hash",);
  });
});
