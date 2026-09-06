// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import type { AssetRecord, } from "../service/types";
import { serveFile, } from "./files";
import { cacheControlFor, contentDispositionFor, } from "./serve-headers";

/**
 * @param overrides
 */
function asset(overrides: Partial<AssetRecord>,): AssetRecord {
  return {
    id: "abcdef01",
    owner_id: "u1",
    filename: "f",
    mime_type: "image/png",
    asset_type: "image",
    size_bytes: 1,
    storage_path: "raw/ab/cd/abcdef01",
    storage_backend: "local",
    visibility: "private",
    width: null,
    height: null,
    duration_secs: null,
    alt_text: null,
    created_at: "2026-01-01",
    encryption_tier: "public",
    encrypted_key_id: null,
    ...overrides,
  };
}

describe("cacheControlFor", () => {
  test("public assets are shared-cache cacheable", () => {
    expect(cacheControlFor(asset({ visibility: "public", },),),).toMatch(/^public,/,);
  });

  test("private and shared assets stay out of shared caches", () => {
    expect(cacheControlFor(asset({ visibility: "private", },),),).toBe("private, max-age=3600",);
    expect(cacheControlFor(asset({ visibility: "shared", },),),).toBe("private, max-age=3600",);
  });
});

describe("contentDispositionFor", () => {
  test("active types are forced to attachment", () => {
    for (const mime of ["image/svg+xml", "text/html", "application/xhtml+xml",]) {
      const headers = contentDispositionFor(asset({ mime_type: mime, },), "evil.svg",);
      expect(headers["Content-Disposition"],).toContain("attachment",);
    }
  });

  test("inert types stay inline", () => {
    expect(contentDispositionFor(asset({ mime_type: "image/png", },), "p.png",),).toEqual({},);
  });

  test("filename is sanitized against header injection", () => {
    const headers = contentDispositionFor(asset({ mime_type: "image/svg+xml", },), 'x"; malicious="1',);
    // No double quote may survive — header injection requires it.
    expect(headers["Content-Disposition"],).toBe('attachment; filename="x_ malicious_1"',);
  });
});

describe("serveFile", () => {
  test("adds nosniff by default and honors cacheControl override", () => {
    const dir = mkdtempSync(join("/tmp", "ll-serve-",),);
    try {
      const p = join(dir, "f.bin",);
      writeFileSync(p, "x",);
      const res = serveFile(p, "application/octet-stream", { cacheControl: "no-store", },);
      expect(res.headers.get("x-content-type-options",),).toBe("nosniff",);
      expect(res.headers.get("cache-control",),).toBe("no-store",);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });
});
