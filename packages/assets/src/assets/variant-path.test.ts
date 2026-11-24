// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for assets/variant-path.ts — candidate resolution and the fallback
 * that keeps a tampered persisted `thumbnail_path` from throwing on a request.
 */

import { describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { resolveCompressedVariantPath, } from "./variant-path";

const ASSET_ID = "aabbccddeeff00112233445566778899";
const SUB_DIR = `${ASSET_ID.slice(0, 2,)}/${ASSET_ID.slice(2, 4,)}`;

describe("resolveCompressedVariantPath", () => {
  test("falls back to the deterministic layout when thumbnail_path is tampered", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-variant-fallback-",),);
    try {
      const fallback = join(uploadDir, "compressed", SUB_DIR, `${ASSET_ID}_thumb.webp`,);
      mkdirSync(join(uploadDir, "compressed", ASSET_ID.slice(0, 2,), ASSET_ID.slice(2, 4,),), { recursive: true, },);
      writeFileSync(fallback, "webp",);

      // A DB row pointing outside the upload root must not throw, and must not
      // be honoured — the deterministic in-root candidate wins instead.
      const resolved = resolveCompressedVariantPath({
        uploadDir,
        assetId: ASSET_ID,
        variant: "thumb",
        thumbnailPath: "../../../../etc/passwd",
      },);

      expect(resolved,).toBe(fallback,);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("returns null (not a throw) when the tampered path has no fallback either", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-variant-null-",),);
    try {
      const resolved = resolveCompressedVariantPath({
        uploadDir,
        assetId: ASSET_ID,
        variant: "thumb",
        thumbnailPath: "/etc/passwd",
      },);

      expect(resolved,).toBeNull();
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("prefers a legitimate in-root thumbnail_path", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-variant-legit-",),);
    try {
      const thumbnailPath = `compressed/${SUB_DIR}/${ASSET_ID}_thumb.webp`;
      const onDisk = join(uploadDir, thumbnailPath,);
      mkdirSync(join(uploadDir, "compressed", ASSET_ID.slice(0, 2,), ASSET_ID.slice(2, 4,),), { recursive: true, },);
      writeFileSync(onDisk, "webp",);

      const resolved = resolveCompressedVariantPath({
        uploadDir,
        assetId: ASSET_ID,
        variant: "thumb",
        thumbnailPath,
      },);

      expect(resolved,).toBe(onDisk,);
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });

  test("ignores thumbnail_path entirely for a non-thumb variant", () => {
    const uploadDir = mkdtempSync(join(tmpdir(), "ll-variant-compressed-",),);
    try {
      const resolved = resolveCompressedVariantPath({
        uploadDir,
        assetId: ASSET_ID,
        variant: "compressed",
        thumbnailPath: "../../../../etc/passwd",
      },);

      expect(resolved,).toBeNull();
    } finally {
      rmSync(uploadDir, { recursive: true, force: true, },);
    }
  });
});
